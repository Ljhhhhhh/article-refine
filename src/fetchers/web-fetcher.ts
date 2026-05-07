import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";
import { JSDOM } from "jsdom";
import type { ContentFetcher, FetchContext, FetchedContent } from "./fetcher.js";

export function extractReadableHtml(sourceUrl: string, html: string): FetchedContent {
  const dom = new JSDOM(html, { url: sourceUrl });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const $ = cheerio.load(html);
  const author = $('meta[name="author"]').attr("content") ?? undefined;
  const rawText = article?.textContent?.trim() ?? $("body").text().replace(/\s+/g, " ").trim();

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
    const response = await fetch(context.sourceUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${context.sourceUrl}`);
    }
    const html = await response.text();
    return extractReadableHtml(context.sourceUrl, html);
  }
}
