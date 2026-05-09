import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

/**
 * Convert HTML (typically the `article.content` output from Readability)
 * into a clean Markdown string suitable for LLM consumption.
 *
 * Design goals:
 * - Preserve code blocks with language hints (from `class="language-xxx"`)
 * - Preserve blockquotes, tables (via GFM), lists, headings
 * - Replace images with `[图片：{alt}]` placeholders to avoid noise
 * - Strip residual navigation / script / style nodes
 */
export function htmlToMarkdown(html: string): string {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "*",
    strongDelimiter: "**",
    linkStyle: "inlined"
  });

  service.use(gfm);

  // Always drop these — Readability usually already stripped them,
  // but be defensive in case the source HTML wasn't processed.
  service.remove(["script", "style", "noscript", "iframe", "nav", "aside", "form"]);

  // Replace images with a compact placeholder that keeps alt text if present.
  service.addRule("image-placeholder", {
    filter: "img",
    replacement: (_content, node) => {
      const alt = (node as HTMLImageElement).getAttribute?.("alt") ?? "";
      return alt ? `[图片：${alt}]` : "[图片]";
    }
  });

  // Preserve language hints on <pre><code class="language-xxx"> blocks
  // (or data-lang="xxx", which web-fetcher uses to survive Readability).
  service.addRule("fenced-code-with-lang", {
    filter: (node) => {
      return (
        node.nodeName === "PRE" &&
        node.firstChild != null &&
        (node.firstChild as HTMLElement).nodeName === "CODE"
      );
    },
    replacement: (_content, node) => {
      const codeEl = (node as HTMLElement).firstChild as HTMLElement | null;
      const className = codeEl?.getAttribute?.("class") ?? "";
      const dataLang = codeEl?.getAttribute?.("data-lang") ?? "";
      const classMatch = className.match(/language-([A-Za-z0-9_+\-]+)/);
      const lang = dataLang || classMatch?.[1] || "";
      const text = codeEl?.textContent ?? "";
      const trimmed = text.replace(/\n+$/g, "");
      return `\n\n\`\`\`${lang}\n${trimmed}\n\`\`\`\n\n`;
    }
  });

  const markdown = service.turndown(html);

  // Normalize list markers: turndown emits "-   item" (3 spaces), we prefer
  // "- item" as it's more canonical and what LLMs typically see in training data.
  const normalized = markdown
    .replace(/^(\s*)-\s{2,}/gm, "$1- ")
    .replace(/^(\s*)\*\s{2,}/gm, "$1* ")
    .replace(/^(\s*)(\d+)\.\s{2,}/gm, "$1$2. ");

  // Collapse 3+ blank lines, trim edges.
  return normalized.replace(/\n{3,}/g, "\n\n").trim();
}
