import { AppError } from "../errors/errors.js";
import type { RoutedLink } from "../router/types.js";
import type { ContentFetcher, FetchedContent } from "./fetcher.js";

export class CompositeFetcher {
  constructor(private readonly fetchers: ContentFetcher[]) {}

  async fetch(routed: RoutedLink): Promise<FetchedContent> {
    const suitableFetchers = this.fetchers.filter((fetcher) =>
      fetcher.canFetch({ sourceUrl: routed.sourceUrl, linkType: routed.linkType })
    );

    for (const fetcher of suitableFetchers) {
      try {
        const content = await fetcher.fetch({
          sourceUrl: routed.sourceUrl,
          linkType: routed.linkType
        });
        if (content.rawText.trim().length > 0) {
          return content;
        }
      } catch {
        continue;
      }
    }

    throw new AppError("FETCH_FAILED", "All fetch strategies failed for the URL.", true);
  }
}
