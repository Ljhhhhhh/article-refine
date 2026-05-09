import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { extractReadableHtml } from "../../src/fetchers/web-fetcher.js";

describe("extractReadableHtml", () => {
  test("extracts title, author, and article markdown from HTML", async () => {
    const html = await readFile(path.join("tests", "fixtures", "html", "tech-blog.html"), "utf8");

    const result = extractReadableHtml("https://example.dev/agent", html);

    expect(result.title).toBe("Agent 架构实践");
    expect(result.author).toBe("Test Author");
    expect(result.rawText).toContain("AI Agent 的工程架构");
    expect(result.rawText).not.toContain("Navigation");
  });

  test("preserves structural markdown in rawText", () => {
    const html = `
      <html>
        <head><title>Structure Test</title></head>
        <body>
          <article>
            <h1>Structure Test</h1>
            <h2>Section</h2>
            <p>Paragraph 1 with <strong>emphasis</strong>.</p>
            <ul><li>bullet one</li><li>bullet two</li></ul>
            <pre><code class="language-js">const x = 1;</code></pre>
            <p>Paragraph after the code block to ensure Readability keeps the content.</p>
            <p>Another paragraph to pass Readability length heuristics for real articles.</p>
          </article>
        </body>
      </html>
    `;

    const result = extractReadableHtml("https://example.com/x", html);

    expect(result.rawText).toContain("## Section");
    expect(result.rawText).toContain("**emphasis**");
    expect(result.rawText).toContain("- bullet one");
    expect(result.rawText).toContain("```js");
    expect(result.rawText).toContain("const x = 1;");
  });
});
