import { describe, expect, test } from "vitest";
import { renderHumanProcessResult } from "../../src/cli/presenters/human.js";

describe("renderHumanProcessResult", () => {
  test("renders a concise human summary for successful process results", () => {
    const output = renderHumanProcessResult({
      ok: true,
      command: "process",
      sourceUrl: "https://example.dev/agent",
      linkType: "tech_blog",
      contentType: "技术深度",
      title: "Agent 工程文章",
      obsidian: {
        saved: true,
        path: "/vault/文章摘要/技术深度/2026-05-07-Agent 工程文章.md",
        filename: "2026-05-07-Agent 工程文章.md",
        tags: ["#技术深度", "#AI编程", "#链接笔记"]
      }
    });

    expect(output).toContain("Link processed and saved");
    expect(output).toContain("Title: Agent 工程文章");
    expect(output).toContain("Saved: /vault/文章摘要/技术深度/2026-05-07-Agent 工程文章.md");
  });

  test("renders skipped result for duplicate sources", () => {
    const output = renderHumanProcessResult({
      ok: true,
      command: "process",
      sourceUrl: "https://example.dev/agent#section",
      skipped: true,
      reason: "SOURCE_ALREADY_EXISTS",
      existingPath: "/vault/文章摘要/综合/2026-05-07-Agent 工程文章.md"
    });

    expect(output).toContain("Link already processed");
    expect(output).toContain("Existing: /vault/文章摘要/综合/2026-05-07-Agent 工程文章.md");
    expect(output).toContain("Action: skipped");
  });
});
