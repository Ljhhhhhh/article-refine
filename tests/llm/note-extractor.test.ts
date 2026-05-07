import { describe, expect, test } from "vitest";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("MockNoteExtractor", () => {
  test("returns schema-valid notes for deterministic process tests", async () => {
    const note = await new MockNoteExtractor().extract({
      sourceUrl: "https://example.dev/agent",
      linkType: "tech_blog",
      title: "Agent 工程文章",
      author: "Author",
      rawText: "架构 API 性能 部署 Agent LLM 大模型 ".repeat(20),
      analysis: {
        wordCount: 120,
        contentType: "技术深度",
        recommendedTags: ["#技术深度", "#AI编程", "#链接笔记"],
        qualityHints: {
          informationDensity: "medium",
          practicality: "high"
        }
      }
    });

    expect(note.title).toBe("Agent 工程文章");
    expect(note.contentType).toBe("技术深度");
    expect(note.keyPoints).toHaveLength(3);
    expect(note.tags).toContain("#链接笔记");
  });
});
