import { describe, expect, test } from "vitest";
import { processedNoteSchema } from "../../src/llm/schema.js";

describe("processedNoteSchema", () => {
  test("accepts a complete note with body", () => {
    const parsed = processedNoteSchema.parse({
      title: "AI Agent 架构设计",
      contentType: "技术深度",
      tags: ["#技术深度", "#AI编程", "#链接笔记"],
      knowledgeConnections: ["Agent 工程化", "Obsidian 知识管理"],
      body: "## 核心要点\n\n- 路由清晰\n- 输出稳定\n- 保存可靠"
    });

    expect(parsed.contentType).toBe("技术深度");
    expect(parsed.body).toContain("## 核心要点");
  });

  test("defaults contentType to 综合 when missing", () => {
    const parsed = processedNoteSchema.parse({
      title: "标题",
      tags: ["#综合"],
      body: "body content"
    });

    expect(parsed.contentType).toBe("综合");
  });

  test("normalizes tags by prepending # when missing", () => {
    const parsed = processedNoteSchema.parse({
      title: "标题",
      contentType: "综合",
      tags: ["tag1", "#tag2"],
      body: "body"
    });

    expect(parsed.tags).toEqual(["#tag1", "#tag2"]);
  });

  test("limits tags to 8 entries", () => {
    const parsed = processedNoteSchema.parse({
      title: "标题",
      contentType: "综合",
      tags: Array.from({ length: 12 }, (_, i) => `#tag${i}`),
      body: "body"
    });

    expect(parsed.tags).toHaveLength(8);
  });

  test("rejects empty body", () => {
    expect(() =>
      processedNoteSchema.parse({
        title: "标题",
        contentType: "综合",
        tags: ["#综合"],
        body: ""
      })
    ).toThrow();
  });

  test("rejects empty title", () => {
    expect(() =>
      processedNoteSchema.parse({
        title: "",
        contentType: "综合",
        tags: ["#综合"],
        body: "body"
      })
    ).toThrow();
  });

  test("rejects empty tags array", () => {
    expect(() =>
      processedNoteSchema.parse({
        title: "标题",
        contentType: "综合",
        tags: [],
        body: "body"
      })
    ).toThrow();
  });

  test("defaults knowledgeConnections to empty array", () => {
    const parsed = processedNoteSchema.parse({
      title: "标题",
      contentType: "综合",
      tags: ["#综合"],
      body: "body"
    });

    expect(parsed.knowledgeConnections).toEqual([]);
  });
});
