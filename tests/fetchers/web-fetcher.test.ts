import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { extractReadableHtml } from "../../src/fetchers/web-fetcher.js";

describe("extractReadableHtml", () => {
  test("extracts title, author, and article text from HTML", async () => {
    const html = await readFile(path.join("tests", "fixtures", "html", "tech-blog.html"), "utf8");

    const result = extractReadableHtml("https://example.dev/agent", html);

    expect(result.title).toBe("Agent 架构实践");
    expect(result.author).toBe("Test Author");
    expect(result.rawText).toContain("AI Agent 的工程架构");
    expect(result.rawText).not.toContain("Navigation");
  });
});
