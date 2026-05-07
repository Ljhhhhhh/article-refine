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
      quality: {
        informationDensity: "high",
        originality: "medium",
        practicality: "high",
        recommendedSave: "strong"
      },
      obsidian: {
        saved: true,
        path: "/vault/文章摘要/技术深度/2026-05-07-Agent 工程文章.md",
        filename: "2026-05-07-Agent 工程文章.md",
        tags: ["#技术深度", "#AI编程", "#链接笔记"]
      }
    });

    expect(output).toContain("Link processed and saved");
    expect(output).toContain("Title: Agent 工程文章");
    expect(output).toContain("Quality: 强烈推荐");
    expect(output).toContain("Saved: /vault/文章摘要/技术深度/2026-05-07-Agent 工程文章.md");
  });
});
