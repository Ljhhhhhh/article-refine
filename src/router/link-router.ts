import type { FetchStrategyConfig, LinkType, RoutedLink } from "./types.js";

const TYPE_PATTERNS: Array<[LinkType, RegExp]> = [
  ["weixin", /mp\.weixin\.qq\.com/i],
  ["twitter", /(^|\.)x\.com($|\/)|(^|\.)twitter\.com($|\/)/i],
  ["video", /(^|\.)bilibili\.com($|\/)|(^|\.)youtube\.com($|\/)|(^|\.)douyin\.com($|\/)/i],
  ["academic", /(^|\.)arxiv\.org($|\/)|(^|\.)doi\.org($|\/)/i],
  ["docs", /(^docs\.|\/docs\/|\/documentation\/|\/readme)/i],
  ["tech_blog", /(\.dev($|\/)|\.blog($|\/)|(^|\.)medium\.com($|\/)|(^|\.)substack\.com($|\/))/i]
];

export class LinkRouter {
  route(sourceUrl: string): RoutedLink {
    const parsedUrl = new URL(sourceUrl);
    const haystack = `${parsedUrl.hostname}${parsedUrl.pathname}`;
    const matched = TYPE_PATTERNS.find(([, pattern]) => pattern.test(haystack));
    const linkType = matched?.[0] ?? "general";

    return {
      sourceUrl,
      linkType,
      strategy: this.getStrategy(linkType)
    };
  }

  private getStrategy(linkType: LinkType): FetchStrategyConfig {
    switch (linkType) {
      case "weixin":
        return {
          primary: "web_fetch",
          fallback: "playwright",
          requiresJs: true
        };
      case "twitter":
        return {
          primary: "twitter_api",
          fallback: "web_fetch",
          requiresFormatting: true
        };
      case "video":
        return {
          primary: "metadata_only",
          metadataOnly: true
        };
      case "tech_blog":
      case "docs":
      case "academic":
      case "general":
        return {
          primary: "web_fetch",
          thresholdChars: 300
        };
    }
  }
}
