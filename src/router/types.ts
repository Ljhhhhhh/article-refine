export type LinkType =
  | "weixin"
  | "twitter"
  | "tech_blog"
  | "video"
  | "academic"
  | "docs"
  | "general";

export type FetchStrategyName =
  | "web_fetch"
  | "twitter_api"
  | "metadata_only"
  | "playwright";

export type FetchStrategyConfig = {
  primary: FetchStrategyName;
  fallback?: FetchStrategyName;
  requiresFormatting?: boolean;
  requiresJs?: boolean;
  thresholdChars?: number;
  metadataOnly?: boolean;
};

export type RoutedLink = {
  sourceUrl: string;
  linkType: LinkType;
  strategy: FetchStrategyConfig;
};
