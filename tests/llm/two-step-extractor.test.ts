import { describe, expect, test, vi } from "vitest";
import { TwoStepExtractor } from "../../src/llm/two-step-extractor.js";

const step1Response = {
  contentType: "技术深度",
  title: "RSC 性能优化",
  coreArguments: ["RSC 减少 bundle"],
  keyEntities: ["React"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  suggestedTags: ["#React", "#RSC"]
};

const step2Response = {
  title: "RSC 性能优化实践",
  contentType: "技术深度",
  summary: "RSC 优化效果显著。",
  keyPoints: [
    { title: "服务端渲染", detail: "组件在服务端渲染。" },
    { title: "按需加载", detail: "客户端仅 hydrate 交互部分。" },
    { title: "性能提升", detail: "首屏 2.1s → 0.8s。" }
  ],
  technicalAnalysis: { architecture: "SSR", mechanism: "序列化", performance: "0.8s", deployment: "Next.js" },
  knowledgeConnections: ["React"],
  tags: ["#React", "#RSC", "#性能"]
};

describe("TwoStepExtractor", () => {
  test("orchestrates step1 then step2 and returns final note", async () => {
    const step1Create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(step1Response) } }]
    });
    const step2Create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(step2Response) } }]
    });

    const extractor = new TwoStepExtractor({
      step1: { apiKey: "test", model: "step1-model" },
      step2: { apiKey: "test", model: "step2-model" }
    });

    // @ts-expect-error mock internal clients
    extractor["step1Analyzer"]["client"] = { chat: { completions: { create: step1Create } } };
    // @ts-expect-error mock internal clients
    extractor["step2Generator"]["client"] = { chat: { completions: { create: step2Create } } };

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      title: "原文标题",
      author: "Author",
      rawText: "RSC 内容..."
    });

    expect(note.title).toBe("RSC 性能优化实践");
    expect(note.contentType).toBe("技术深度");
    expect(step1Create).toHaveBeenCalledOnce();
    expect(step2Create).toHaveBeenCalledOnce();
  });

  test("uses step1 analysis to select step2 prompt", async () => {
    const opinionStep1 = { ...step1Response, contentType: "观点思考" };
    const opinionStep2 = { ...step2Response, contentType: "观点思考", argumentStructure: { mainClaim: "claim", supportingArguments: ["arg"] } };

    const extractor = new TwoStepExtractor({
      step1: { apiKey: "test", model: "m1" },
      step2: { apiKey: "test", model: "m2" }
    });

    // @ts-expect-error mock
    extractor["step1Analyzer"]["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(opinionStep1) } }] }) } } };
    // @ts-expect-error mock
    extractor["step2Generator"]["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify(opinionStep2) } }] }) } } };

    const note = await extractor.extract({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "opinion content"
    });

    expect(note.contentType).toBe("观点思考");
    expect(note.argumentStructure?.mainClaim).toBe("claim");
  });
});
