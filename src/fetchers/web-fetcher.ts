import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { ContentFetcher, FetchContext, FetchedContent } from "./fetcher.js";
import { proxyFetch } from "./proxy-fetch.js";
import { htmlToMarkdown } from "./html-to-markdown.js";

/**
 * Readability strips most `class` attributes. Preserve language hints by
 * migrating `class="language-xxx"` to `data-lang="xxx"` before parsing.
 */
function preserveCodeLanguages(document: Document): void {
  const codeNodes = document.querySelectorAll("code[class*='language-']");
  codeNodes.forEach((node) => {
    const className = node.getAttribute("class") ?? "";
    const match = className.match(/language-([A-Za-z0-9_+\-]+)/);
    if (match) {
      node.setAttribute("data-lang", match[1]);
    }
  });
}

export function extractReadableHtml(sourceUrl: string, html: string): FetchedContent {
  const dom = new JSDOM(html, { url: sourceUrl });
  preserveCodeLanguages(dom.window.document);

  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const $ = cheerio.load(html);
  const author = $('meta[name="author"]').attr("content") ?? undefined;

  let rawText: string;
  if (article?.content) {
    rawText = htmlToMarkdown(article.content);
    if (!rawText.trim()) {
      rawText = article.textContent?.trim() ?? "";
    }
  } else {
    rawText = $("body").text().replace(/\s+/g, " ").trim();
  }

  return {
    sourceUrl,
    title: article?.title?.trim() || $("title").text().trim() || undefined,
    author,
    rawText,
    rawHtml: html,
    metadata: {
      excerpt: article?.excerpt ?? undefined
    }
  };
}

export class WebFetcher implements ContentFetcher {
  name = "web_fetch";

  canFetch(context: FetchContext): boolean {
    return context.linkType !== "twitter" && context.linkType !== "video";
  }

  async fetch(context: FetchContext): Promise<FetchedContent> {
    const response = await proxyFetch(context.sourceUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${context.sourceUrl}`);
    }
    const html = await response.text();
    return extractReadableHtml(context.sourceUrl, html);
  }
}
