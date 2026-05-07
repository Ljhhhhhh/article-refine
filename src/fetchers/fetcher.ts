import type { LinkType } from "../router/types.js";

export type FetchedContent = {
  sourceUrl: string;
  title?: string;
  author?: string;
  publishedAt?: string;
  rawText: string;
  rawHtml?: string;
  metadata: Record<string, unknown>;
};

export type FetchContext = {
  sourceUrl: string;
  linkType: LinkType;
};

export interface ContentFetcher {
  name: string;
  canFetch(context: FetchContext): boolean;
  fetch(context: FetchContext): Promise<FetchedContent>;
}
