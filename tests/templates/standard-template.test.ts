import { describe, expect, test } from "vitest";
import { renderStandardTemplate } from "../../src/templates/standard-template.js";

describe("renderStandardTemplate", () => {
  test("renders header, body, and Obsidian knowledge connections", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "AI Agent 架构设计",
        contentType: "技术深度",
        tags: ["#技术深度", "#AI编程", "#链接笔记"],
        knowledgeConnections: ["Agent 工程化", "Obsidian 知识库"],
        clickbaitIndex: 5,
        body: "## 背景\n\n架构确定性与结构化 LLM 输出的分工。\n\n## 方案\n\n- CLI 稳定\n- 保存可靠"
      },
      sourceUrl: "https://example.com/article",
      author: "Example Author",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).toContain("# AI Agent 架构设计");
    expect(markdown).toContain("> 创建日期：2026-05-07");
    expect(markdown).toContain("> 来源：https://example.com/article");
    expect(markdown).toContain("> 作者：Example Author");
    expect(markdown).toContain("> 抓取时间：2026-05-07 10:20");
    expect(markdown).toContain("> 标签：#技术深度 #AI编程 #链接笔记");
    expect(markdown).toContain("## 背景");
    expect(markdown).toContain("- CLI 稳定");
    expect(markdown).toContain("## 知识连接");
    expect(markdown).toContain("- [[Agent 工程化]]");
    expect(markdown).toContain("- [[Obsidian 知识库]]");
    expect(markdown).not.toContain("## 原文链接");
  });

  test("defaults author to 未知 when absent", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "标题",
        contentType: "综合",
        tags: ["#综合"],
        knowledgeConnections: [],
        clickbaitIndex: 5,
        body: "body content"
      },
      sourceUrl: "https://example.com/x",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).toContain("> 作者：未知");
  });

  test("omits knowledge connections section when empty", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "标题",
        contentType: "综合",
        tags: ["#综合"],
        knowledgeConnections: [],
        clickbaitIndex: 5,
        body: "body"
      },
      sourceUrl: "https://example.com/x",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).not.toContain("## 知识连接");
  });

  test("preserves body markdown formatting verbatim", () => {
    const body = "```ts\nconst x = 1;\n```\n\n> 引用块\n\n| col | col |\n|---|---|\n| a | b |";
    const markdown = renderStandardTemplate({
      note: {
        title: "标题",
        contentType: "技术深度",
        tags: ["#代码"],
        knowledgeConnections: [],
        clickbaitIndex: 5,
        body
      },
      sourceUrl: "https://example.com/x",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).toContain("```ts");
    expect(markdown).toContain("const x = 1;");
    expect(markdown).toContain("> 引用块");
    expect(markdown).toContain("| col | col |");
  });

  test("renders YAML frontmatter for Obsidian metadata", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "RSC 性能优化实践",
        summary: "文章介绍了 RSC 在性能优化中的实践方式和关键收益。",
        contentType: "技术深度",
        tags: ["#React", "#RSC", "#性能优化"],
        knowledgeConnections: ["Next.js App Router"],
        clickbaitIndex: 5,
        body: "## 背景\n\n正文"
      },
      sourceUrl: "https://example.com/rsc",
      author: "Example Author",
      createdAt: new Date("2026-05-09T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-09T10:20:00.000Z")
    });

    expect(markdown.startsWith("---\n")).toBe(true);
    expect(markdown).toContain("title: RSC 性能优化实践");
    expect(markdown).toContain("summary: 文章介绍了 RSC 在性能优化中的实践方式和关键收益。");
    expect(markdown).toContain("source_url: https://example.com/rsc");
    expect(markdown).toContain("content_type: 技术深度");
    expect(markdown).toContain("created: 2026-05-09");
    expect(markdown).toContain("fetched: 2026-05-09 10:20");
    expect(markdown).toContain("- React");
    expect(markdown).toContain("- RSC");
  });

  test("preserves existing Obsidian knowledge links", () => {
    const markdown = renderStandardTemplate({
      note: {
        title: "标题",
        contentType: "综合",
        tags: ["#综合"],
        knowledgeConnections: ["[[已有连接]]", "[[已有连接|别名]]"],
        clickbaitIndex: 5,
        body: "body"
      },
      sourceUrl: "https://example.com/x",
      createdAt: new Date("2026-05-07T00:00:00.000Z"),
      fetchedAt: new Date("2026-05-07T10:20:00.000Z")
    });

    expect(markdown).toContain("- [[已有连接]]");
    expect(markdown).toContain("- [[已有连接|别名]]");
    expect(markdown).not.toContain("[[[[已有连接]]]]");
  });
});
