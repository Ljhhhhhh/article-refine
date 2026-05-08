import { describe, expect, test, vi } from "vitest";
import { OpenAINoteExtractor } from "../../src/llm/openai-extractor.js";
import { createExtractor } from "../../src/llm/factory.js";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("OpenAINoteExtractor", () => {
  test("extract produces schema-valid note from mocked API response", async () => {
    const validResponse = {
      title: "AI Agent 架构设计",
      contentType: "技术深度",
      summary: "这是一篇关于 Agent 架构的深度分析文章，讨论了系统的模块化设计。",
      keyPoints: [
        { title: "路由清晰", detail: "URL 路由应当由确定性代码完成。" },
        { title: "输出稳定", detail: "AI 调用需要固定 JSON schema。" },
        { title: "保存可靠", detail: "Obsidian 写入是成功标准。" }
      ],
      technicalAnalysis: {
        architecture: "CLI 调用核心库。",
        mechanism: "抓取、分析、渲染、保存串联。",
        performance: "MVP 先串行执行。",
        deployment: "本地 CLI 使用。"
      },
      knowledgeConnections: ["Agent 工程化", "Obsidian 知识管理"],
      quality: {
        informationDensity: "high",
        originality: "medium",
        practicality: "high",
        recommendedSave: "strong"
      },
      tags: ["#技术深度", "#AI编程", "#链接笔记"]
    };

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validResponse) } }]
    });

    const extractor = new OpenAINoteExtractor({
      apiKey: "test-key",
      model: "gpt-4o"
    });

    // @ts-expect-error mock the internal client
    extractor["client"] = { chat: { completions: { create: mockCreate } } };

    const note = await extractor.extract({
      sourceUrl: "https://example.dev/agent",
      linkType: "tech_blog",
      title: "Agent 工程文章",
      author: "Author",
      rawText: "架构 API 性能 部署 Agent LLM 大模型 ".repeat(20),
      analysis: {
        wordCount: 120,
        contentType: "技术深度",
        recommendedTags: ["#技术深度", "#AI编程", "#链接笔记"],
        qualityHints: { informationDensity: "medium", practicality: "high" }
      }
    });

    expect(note.title).toBe("AI Agent 架构设计");
    expect(note.contentType).toBe("技术深度");
    expect(note.keyPoints).toHaveLength(3);
    expect(note.tags).toContain("#链接笔记");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("throws LLM_OUTPUT_INVALID when response has no JSON", async () => {
    const extractor = new OpenAINoteExtractor({
      apiKey: "test-key",
      model: "gpt-4o"
    });

    extractor["client"] = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "I cannot output JSON." } }]
          })
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    await expect(
      extractor.extract({
        sourceUrl: "https://example.dev",
        linkType: "general",
        rawText: "some text",
        analysis: {
          wordCount: 10,
          contentType: "综合",
          recommendedTags: ["#综合", "#链接笔记"],
          qualityHints: { informationDensity: "low", practicality: "medium" }
        }
      })
    ).rejects.toThrow("LLM response did not contain JSON");
  });
});

describe("createExtractor", () => {
  test("returns MockNoteExtractor for mock provider", () => {
    const extractor = createExtractor({ provider: "mock", model: "mock" });
    expect(extractor).toBeInstanceOf(MockNoteExtractor);
  });

  test("returns OpenAINoteExtractor for openai provider", () => {
    const extractor = createExtractor({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key"
    });
    expect(extractor).toBeInstanceOf(OpenAINoteExtractor);
  });

  test("throws when openai provider has no API key", () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(() =>
      createExtractor({ provider: "openai", model: "gpt-4o" })
    ).toThrow("OpenAI API key required");

    if (original) process.env.OPENAI_API_KEY = original;
  });
});
