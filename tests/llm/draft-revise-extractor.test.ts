import { describe, expect, test, vi } from "vitest";
import { DraftReviseExtractor } from "../../src/llm/draft-revise-extractor.js";

const draftResponse = {
  title: "RSC 性能优化实践",
  contentType: "技术深度",
  tags: ["#React", "#RSC", "#性能优化"],
  knowledgeConnections: ["Next.js App Router", "SSR 架构"],
  body: "## 背景\n\n作者用 RSC 替换客户端渲染。\n\n## 效果\n\n首屏 2.1s → 0.8s"
};

const revisedResponse = {
  ...draftResponse,
  body:
    "## 背景\n\n作者在 Next.js 14 中用 RSC 替换客户端渲染。\n\n## 效果\n\n首屏 LCP 从 2.1s 降到 0.8s，JS 传输量减少 62%。"
};

function mockCompletion(content: string) {
  return vi.fn().mockResolvedValue({
    choices: [{ message: { content } }]
  });
}

function injectClient(target: unknown, key: string, create: ReturnType<typeof vi.fn>): void {
  (target as Record<string, { client: unknown }>)[key].client = {
    chat: { completions: { create } }
  };
}

describe("DraftReviseExtractor", () => {
  test("runs draft then revise and returns revised note", async () => {
    const extractor = new DraftReviseExtractor({
      draft: { apiKey: "test", model: "draft-model" },
      revise: { apiKey: "test", model: "revise-model" },
      compressor: { apiKey: "test", model: "draft-model" },
      longContentThreshold: 100000
    });

    const draftCreate = mockCompletion(JSON.stringify(draftResponse));
    const reviseCreate = mockCompletion(JSON.stringify(revisedResponse));
    injectClient(extractor, "draftGenerator", draftCreate);
    injectClient(extractor, "reviser", reviseCreate);

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      title: "原文标题",
      author: "Author",
      rawText: "RSC 相关内容..."
    });

    expect(note.title).toBe("RSC 性能优化实践");
    expect(note.contentType).toBe("技术深度");
    expect(note.body).toContain("62%");
    expect(draftCreate).toHaveBeenCalledOnce();
    expect(reviseCreate).toHaveBeenCalledOnce();
  });

  test("skips revise when skipRevise is true", async () => {
    const extractor = new DraftReviseExtractor({
      draft: { apiKey: "test", model: "draft-model" },
      revise: { apiKey: "test", model: "revise-model" },
      compressor: { apiKey: "test", model: "draft-model" },
      longContentThreshold: 100000,
      skipRevise: true
    });

    const draftCreate = mockCompletion(JSON.stringify(draftResponse));
    const reviseCreate = mockCompletion(JSON.stringify(revisedResponse));
    injectClient(extractor, "draftGenerator", draftCreate);
    injectClient(extractor, "reviser", reviseCreate);

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "content"
    });

    expect(note.body).toBe(draftResponse.body);
    expect(draftCreate).toHaveBeenCalledOnce();
    expect(reviseCreate).not.toHaveBeenCalled();
  });

  test("progress callback reports drafting and revising steps", async () => {
    const steps: string[] = [];
    const extractor = new DraftReviseExtractor({
      draft: { apiKey: "test", model: "m" },
      revise: { apiKey: "test", model: "m" },
      compressor: { apiKey: "test", model: "m" },
      longContentThreshold: 100000,
      onProgress: (s) => steps.push(s)
    });

    injectClient(extractor, "draftGenerator", mockCompletion(JSON.stringify(draftResponse)));
    injectClient(extractor, "reviser", mockCompletion(JSON.stringify(revisedResponse)));

    await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "short content"
    });

    expect(steps).toEqual(["preparing", "drafting", "revising"]);
  });

  test("strips <think> tags from revise output", async () => {
    const extractor = new DraftReviseExtractor({
      draft: { apiKey: "test", model: "m" },
      revise: { apiKey: "test", model: "m" },
      compressor: { apiKey: "test", model: "m" },
      longContentThreshold: 100000
    });

    injectClient(extractor, "draftGenerator", mockCompletion(JSON.stringify(draftResponse)));
    injectClient(
      extractor,
      "reviser",
      mockCompletion(
        `<think>对照原文检查...发现数字需要更精确。</think>\n${JSON.stringify(revisedResponse)}`
      )
    );

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      rawText: "content"
    });

    expect(note.body).toContain("62%");
  });
});
