import { describe, expect, test, vi } from "vitest";
import { Step2Generator } from "../../src/llm/step2-generator.js";

const validNote = {
  title: "RSC 性能优化实践",
  contentType: "技术深度",
  summary: "文章介绍了 RSC 的核心机制和性能优化效果。",
  keyPoints: [
    { title: "服务端渲染", detail: "组件在服务端渲染，减少客户端 JS。" },
    { title: "按需加载", detail: "客户端仅 hydrate 交互部分。" },
    { title: "性能提升", detail: "首屏加载从 2.1s 降至 0.8s。" }
  ],
  technicalAnalysis: {
    architecture: "服务端渲染组件树",
    mechanism: "序列化组件状态发送到客户端",
    performance: "首屏 2.1s → 0.8s",
    deployment: "Next.js App Router"
  },
  knowledgeConnections: ["React", "SSR"],
  quality: { informationDensity: "high", originality: "medium", practicality: "high", recommendedSave: "strong" },
  tags: ["#React", "#RSC", "#性能优化"]
};

const step1Analysis = {
  contentType: "技术深度" as const,
  title: "RSC 性能优化实践",
  coreArguments: ["RSC 减少 JS bundle 大小"],
  keyEntities: ["React", "Server Components"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  quality: { informationDensity: "high" as const, originality: "medium" as const, practicality: "high" as const },
  suggestedTags: ["#React", "#RSC"]
};

describe("Step2Generator", () => {
  test("returns parsed note from mocked API response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validNote) } }]
    });

    const generator = new Step2Generator({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    generator["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await generator.generate(
      { sourceUrl: "https://example.com", linkType: "tech_blog", rawText: "content" },
      step1Analysis
    );

    expect(result.title).toBe("RSC 性能优化实践");
    expect(result.contentType).toBe("技术深度");
    expect(result.keyPoints).toHaveLength(3);
    expect(mockCreate).toHaveBeenCalledOnce();

    // Verify the prompt was selected based on contentType
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("技术分析师");
  });

  test("uses opinion prompt for 观点思考 content", async () => {
    const opinionNote = {
      ...validNote,
      contentType: "观点思考",
      argumentStructure: { mainClaim: "AI 不会取代程序员", supportingArguments: ["创造性不可自动化"] }
    };

    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(opinionNote) } }]
    });

    const generator = new Step2Generator({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    generator["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await generator.generate(
      { sourceUrl: "https://example.com", linkType: "general", rawText: "content" },
      { ...step1Analysis, contentType: "观点思考" }
    );

    expect(result.argumentStructure?.mainClaim).toBe("AI 不会取代程序员");
  });
});
