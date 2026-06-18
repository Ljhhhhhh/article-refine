import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { CompositeFetcher } from "../fetchers/composite-fetcher.js";
import type { ContentFetcher } from "../fetchers/fetcher.js";
import { routeLink } from "./route-link.js";
import type { ContentType } from "../llm/schema.js";
import type { LinkType } from "../router/types.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type InspectSuccessResult = {
  ok: true;
  command: "inspect";
  sourceUrl: string;
  linkType: LinkType;
  title?: string;
  author?: string;
  wordCount: number;
  contentType: ContentType;
  recommendedTags: string[];
};

export type InspectResult = InspectSuccessResult | FailureResult;

export type InspectOptions = {
  fetchers: ContentFetcher[];
  qualityThreshold: number;
};

function isLocalFile(source: string): boolean {
  return !source.startsWith("http://") && !source.startsWith("https://")
    && (source.endsWith(".md") || source.endsWith(".markdown"));
}

export async function inspectLink(sourceUrl: string, options: InspectOptions): Promise<InspectResult> {
  if (isLocalFile(sourceUrl)) {
    return inspectLocalFile(sourceUrl, options);
  }

  const routed = routeLink(sourceUrl);
  if (!routed.ok) {
    return routed;
  }

  try {
    const content = await new CompositeFetcher(options.fetchers).fetch(routed);
    if (routed.linkType !== "video" && content.rawText.length < options.qualityThreshold) {
      throw new AppError("CONTENT_TOO_SHORT", "Fetched content is below the quality threshold.");
    }
    const wordCount = content.rawText.split(/\s+/).filter(Boolean).length;

    return {
      ok: true,
      command: "inspect",
      sourceUrl,
      linkType: routed.linkType,
      title: content.title,
      author: content.author,
      wordCount,
      contentType: "综合",
      recommendedTags: []
    };
  } catch (error) {
    return toFailureResult("inspect", error, sourceUrl);
  }
}

async function inspectLocalFile(filePath: string, options: InspectOptions): Promise<InspectResult> {
  const absPath = path.resolve(filePath);
  const sourceUrl = `file://${absPath}`;

  try {
    await stat(absPath);
  } catch {
    return toFailureResult("inspect", new AppError("FILE_NOT_FOUND", `Local file not found: ${absPath}`), sourceUrl);
  }

  try {
    const rawText = await readFile(absPath, "utf8");
    if (rawText.length < options.qualityThreshold) {
      throw new AppError("CONTENT_TOO_SHORT", "File content is below the quality threshold.");
    }

    const title = path.basename(absPath, path.extname(absPath));
    const wordCount = rawText.split(/\s+/).filter(Boolean).length;

    return {
      ok: true,
      command: "inspect",
      sourceUrl,
      linkType: "general",
      title,
      wordCount,
      contentType: "综合",
      recommendedTags: []
    };
  } catch (error) {
    return toFailureResult("inspect", error, sourceUrl);
  }
}
