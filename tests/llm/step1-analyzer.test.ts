import { describe, expect, test, vi } from "vitest";
import { Step1Analyzer } from "../../src/llm/step1-analyzer.js";

const validAnalysis = {
  contentType: "技术深度",
  title: "RSC 性能优化实践",
  coreArguments: ["RSC 减少 JS bundle 大小"],
  keyEntities: ["React", "Server Components"],
  writingStyle: "技术教程",
  targetAudience: "前端开发者",
  suggestedTags: ["#React", "#RSC", "#性能优化"]
};

describe("Step1Analyzer", () => {
  test("returns parsed analysis from mocked API response", async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(validAnalysis) } }]
    });

    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: mockCreate } } };

    const result = await analyzer.analyze({
      sourceUrl: "https://example.com",
      linkType: "tech_blog",
      title: "原文标题",
      author: "Author",
      rawText: "RSC 性能优化内容..."
    });

    expect(result.contentType).toBe("技术深度");
    expect(result.title).toBe("RSC 性能优化实践");
    expect(result.coreArguments).toContain("RSC 减少 JS bundle 大小");
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  test("handles thinking tags in response", async () => {
    const responseWithThinking = {
      choices: [{
        message: {
          content: `<think>Let me analyze this content... I think it's about React.</think>\n${JSON.stringify(validAnalysis)}`
        }
      }]
    };

    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue(responseWithThinking) } } };

    const result = await analyzer.analyze({
      sourceUrl: "https://example.com",
      linkType: "general",
      rawText: "content"
    });

    expect(result.contentType).toBe("技术深度");
  });

  test("throws LLM_OUTPUT_INVALID when no JSON in response", async () => {
    const analyzer = new Step1Analyzer({ apiKey: "test", model: "test" });
    // @ts-expect-error mock internal client
    analyzer["client"] = { chat: { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: "no json here" } }] }) } } };

    await expect(
      analyzer.analyze({ sourceUrl: "https://example.com", linkType: "general", rawText: "text" })
    ).rejects.toThrow("LLM response did not contain valid JSON");
  });
});
