import { describe, expect, test } from "vitest";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("MockNoteExtractor", () => {
  test("returns schema-valid notes with a markdown body", async () => {
    const note = await new MockNoteExtractor().extract({
      sourceUrl: "https://example.dev/agent",
      linkType: "tech_blog",
      title: "Agent 工程文章",
      author: "Author",
      rawText: "架构 API 性能 部署 Agent LLM 大模型 ".repeat(20)
    });

    expect(note.title).toBe("Agent 工程文章");
    expect(note.contentType).toBe("综合");
    expect(note.body).toContain("## ");
    expect(note.tags).toContain("#链接笔记");
    expect(note.knowledgeConnections).toContain("tech_blog");
  });

  test("falls back to default title when none provided", async () => {
    const note = await new MockNoteExtractor().extract({
      sourceUrl: "https://example.dev/agent",
      linkType: "general",
      rawText: "content content content"
    });

    expect(note.title).toBe("未命名链接笔记");
  });
});
