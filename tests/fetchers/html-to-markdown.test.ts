import { describe, expect, test } from "vitest";
import { htmlToMarkdown } from "../../src/fetchers/html-to-markdown.js";

describe("htmlToMarkdown", () => {
  test("converts headings, paragraphs, and lists", () => {
    const html = `
      <h2>Section</h2>
      <p>A paragraph with <strong>bold</strong> and <em>italic</em>.</p>
      <ul><li>one</li><li>two</li></ul>
    `;
    const md = htmlToMarkdown(html);

    expect(md).toContain("## Section");
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("- one");
    expect(md).toContain("- two");
  });

  test("preserves code block language hints", () => {
    const html = `<pre><code class="language-ts">const x: number = 1;</code></pre>`;
    const md = htmlToMarkdown(html);

    expect(md).toContain("```ts");
    expect(md).toContain("const x: number = 1;");
    expect(md).toContain("```");
  });

  test("replaces images with alt-text placeholders", () => {
    const html = `<p>before</p><img src="x.png" alt="架构图" /><p>after</p>`;
    const md = htmlToMarkdown(html);

    expect(md).toContain("[图片：架构图]");
    expect(md).not.toContain("x.png");
  });

  test("replaces images without alt text with a generic placeholder", () => {
    const html = `<img src="x.png" />`;
    const md = htmlToMarkdown(html);

    expect(md).toContain("[图片]");
  });

  test("preserves blockquotes", () => {
    const html = `<blockquote><p>作者的原话</p></blockquote>`;
    const md = htmlToMarkdown(html);

    expect(md).toMatch(/^>\s+作者的原话/m);
  });

  test("preserves tables via GFM", () => {
    const html = `
      <table>
        <thead><tr><th>a</th><th>b</th></tr></thead>
        <tbody><tr><td>1</td><td>2</td></tr></tbody>
      </table>
    `;
    const md = htmlToMarkdown(html);

    expect(md).toContain("| a | b |");
    expect(md).toContain("| 1 | 2 |");
  });

  test("strips script and style nodes", () => {
    const html = `<script>alert(1)</script><style>.x{}</style><p>keep</p>`;
    const md = htmlToMarkdown(html);

    expect(md).not.toContain("alert(1)");
    expect(md).not.toContain(".x{}");
    expect(md).toContain("keep");
  });

  test("collapses excessive blank lines", () => {
    const html = `<p>a</p>\n\n\n\n<p>b</p>`;
    const md = htmlToMarkdown(html);

    expect(md).not.toMatch(/\n{3,}/);
  });
});
