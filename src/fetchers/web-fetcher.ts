import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { ContentFetcher, FetchContext, FetchedContent } from "./fetcher.js";
import { proxyFetch } from "./proxy-fetch.js";
import { htmlToMarkdown } from "./html-to-markdown.js";

const DEFAULT_WEB_FETCH_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "zh-CN,zh;q=0.9,en;q=0.8"
} satisfies HeadersInit;

function normalizeText(text?: string): string | undefined {
  const normalized = text?.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function isWeixinUrl(sourceUrl: string): boolean {
  return /(^|\.)mp\.weixin\.qq\.com$/i.test(new URL(sourceUrl).hostname);
}

function getFetchHeaders(sourceUrl: string): HeadersInit {
  if (!isWeixinUrl(sourceUrl)) {
    return DEFAULT_WEB_FETCH_HEADERS;
  }

  return {
    ...DEFAULT_WEB_FETCH_HEADERS,
    referer: "https://mp.weixin.qq.com/"
  };
}

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

export function extractWeixinHtml(sourceUrl: string, html: string): FetchedContent | undefined {
  const $ = cheerio.load(html);
  const contentHtml = $("#js_content").html();
  if (!contentHtml?.trim()) {
    return undefined;
  }

  const rawText = htmlToMarkdown(contentHtml);
  return {
    sourceUrl,
    title:
      normalizeText($("#activity-name").text()) ??
      normalizeText($('meta[property="og:title"]').attr("content")) ??
      normalizeText($("title").text()),
    author:
      normalizeText($("#js_name").text()) ??
      normalizeText($('meta[name="author"]').attr("content")) ??
      normalizeText($(".rich_media_meta_text").first().text()),
    rawText,
    rawHtml: html,
    metadata: {
      excerpt: normalizeText($('meta[property="og:description"]').attr("content"))
    }
  };
}

export class WebFetcher implements ContentFetcher {
  name = "web_fetch";

  canFetch(context: FetchContext): boolean {
    return context.linkType !== "twitter" && context.linkType !== "video";
  }

  async fetch(context: FetchContext): Promise<FetchedContent> {
    const response = await proxyFetch(context.sourceUrl, {
      headers: getFetchHeaders(context.sourceUrl)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${context.sourceUrl}`);
    }
    const html = await response.text();
    if (context.linkType === "weixin") {
      const content = extractWeixinHtml(context.sourceUrl, html);
      if (content) {
        return content;
      }
    }

    return extractReadableHtml(context.sourceUrl, html);
  }
}
