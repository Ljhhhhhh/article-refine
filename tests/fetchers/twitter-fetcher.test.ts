import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { parseTwitterApiResponse } from "../../src/fetchers/twitter-fetcher.js";

describe("parseTwitterApiResponse", () => {
  test("parses fxtwitter article blocks into markdown-like text", async () => {
    const json = JSON.parse(
      await readFile(path.join("tests", "fixtures", "twitter", "article.json"), "utf8")
    );

    const result = parseTwitterApiResponse("https://x.com/example/status/123", json);

    expect(result.title).toBe("Agent 长文标题");
    expect(result.author).toBe("Example Author");
    expect(result.rawText).toContain("# Agent 长文标题");
    expect(result.rawText).toContain("- 稳定 JSON 输出");
    expect(result.metadata).toMatchObject({
      authorHandle: "example",
      likes: 12,
      views: 1000
    });
  });
});
