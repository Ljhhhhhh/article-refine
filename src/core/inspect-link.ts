import { analyzeContent } from "../analyzer/content-analyzer.js";
import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { CompositeFetcher } from "../fetchers/composite-fetcher.js";
import type { ContentFetcher } from "../fetchers/fetcher.js";
import { routeLink } from "./route-link.js";
import type { ContentType } from "../llm/schema.js";
import type { LinkType } from "../router/types.js";

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

export async function inspectLink(sourceUrl: string, options: InspectOptions): Promise<InspectResult> {
  const routed = routeLink(sourceUrl);
  if (!routed.ok) {
    return routed;
  }

  try {
    const content = await new CompositeFetcher(options.fetchers).fetch(routed);
    if (routed.linkType !== "video" && content.rawText.length < options.qualityThreshold) {
      throw new AppError("CONTENT_TOO_SHORT", "Fetched content is below the quality threshold.");
    }
    const analysis = analyzeContent(content.rawText);

    return {
      ok: true,
      command: "inspect",
      sourceUrl,
      linkType: routed.linkType,
      title: content.title,
      author: content.author,
      wordCount: analysis.wordCount,
      contentType: analysis.contentType,
      recommendedTags: analysis.recommendedTags
    };
  } catch (error) {
    return toFailureResult("inspect", error, sourceUrl);
  }
}
