import type { ContentFetcher, FetchContext, FetchedContent } from "./fetcher.js";

type TwitterBlock = {
  type?: string;
  text?: string;
};

function blockToMarkdown(block: TwitterBlock): string {
  const text = block.text ?? "";
  switch (block.type) {
    case "header-one":
      return `# ${text}`;
    case "header-two":
      return `## ${text}`;
    case "header-three":
      return `### ${text}`;
    case "unordered-list-item":
      return `- ${text}`;
    case "ordered-list-item":
      return `1. ${text}`;
    default:
      return text;
  }
}

export function parseTwitterApiResponse(sourceUrl: string, data: unknown): FetchedContent {
  const tweet = (data as { tweet?: Record<string, unknown> }).tweet;
  if (!tweet) {
    throw new Error("Twitter API response does not contain tweet.");
  }

  const author = tweet.author as { name?: string; screen_name?: string } | undefined;
  const article = tweet.article as
    | { content?: { blocks?: TwitterBlock[] } }
    | undefined;
  const blocks = article?.content?.blocks;
  const rawText = blocks?.map(blockToMarkdown).join("\n\n") ?? String(tweet.text ?? "");
  const titleBlock = blocks?.find((block) => block.type?.startsWith("header"));

  return {
    sourceUrl,
    title: titleBlock?.text,
    author: author?.name,
    publishedAt: typeof tweet.created_timestamp === "string" ? tweet.created_timestamp : undefined,
    rawText,
    metadata: {
      authorHandle: author?.screen_name,
      likes: tweet.likes,
      retweets: tweet.retweets,
      replies: tweet.replies,
      views: tweet.views,
      id: tweet.id
    }
  };
}

function toFxTwitterUrl(sourceUrl: string): string {
  const parsed = new URL(sourceUrl);
  parsed.hostname = "api.fxtwitter.com";
  return parsed.toString();
}

export class TwitterFetcher implements ContentFetcher {
  name = "twitter_api";

  canFetch(context: FetchContext): boolean {
    return context.linkType === "twitter";
  }

  async fetch(context: FetchContext): Promise<FetchedContent> {
    const response = await fetch(toFxTwitterUrl(context.sourceUrl));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${context.sourceUrl}`);
    }
    return parseTwitterApiResponse(context.sourceUrl, await response.json());
  }
}
