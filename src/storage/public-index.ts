import type { ContentTypeDirectory } from "./file-naming.js";
import type { OssUploader } from "./oss-uploader.js";

export type PublicArticleEntry = {
  slug: string;
  title: string;
  path: string;
  contentType: ContentTypeDirectory;
  created: string;
  updatedAt: string;
  tags: string[];
  author?: string;
  sourceUrl: string;
  summary?: string;
  excerpt?: string;
  readingTime?: number;
  sourceHost?: string;
};

export type PublicArticleIndex = {
  version: 1;
  generatedAt: string;
  articles: PublicArticleEntry[];
};

function emptyIndex(generatedAt: string): PublicArticleIndex {
  return { version: 1, generatedAt, articles: [] };
}

function sortArticles(articles: PublicArticleEntry[]): PublicArticleEntry[] {
  return [...articles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function sourceHostFromUrl(sourceUrl: string): string | undefined {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/^---\n[\s\S]*?\n---\n?/u, "")
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/^>\s?/gmu, "")
    .replace(/[*_~#[\]()>|-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function excerptFromText(text: string, maxLength = 150): string | undefined {
  const normalized = text.replace(/\s+/gu, " ").trim();
  if (!normalized) return undefined;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trimEnd()}…`
    : normalized;
}

export function estimateReadingTime(text: string): number {
  const normalized = text.replace(/\s+/gu, "");
  return Math.max(1, Math.ceil(normalized.length / 500));
}

const indexQueues = new Map<string, Promise<unknown>>();

async function runWithIndexQueue<T>(indexKey: string, task: () => Promise<T>): Promise<T> {
  const previous = indexQueues.get(indexKey) ?? Promise.resolve();
  const current = previous.then(task, task);
  indexQueues.set(indexKey, current.catch(() => undefined));

  try {
    return await current;
  } finally {
    if (indexQueues.get(indexKey) === current) {
      indexQueues.delete(indexKey);
    }
  }
}

export async function readPublicArticleIndexFromOss(
  indexKey: string,
  uploader: OssUploader,
  now: () => Date = () => new Date()
): Promise<PublicArticleIndex> {
  try {
    const raw = await uploader.getObject(indexKey);
    if (!raw) return emptyIndex(now().toISOString());

    const parsed = JSON.parse(raw) as PublicArticleIndex;
    return {
      version: 1,
      generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : now().toISOString(),
      articles: Array.isArray(parsed.articles) ? sortArticles(parsed.articles) : []
    };
  } catch {
    return emptyIndex(now().toISOString());
  }
}

export async function upsertPublicArticleIndexInOss(
  indexKey: string,
  uploader: OssUploader,
  entry: PublicArticleEntry,
  now: () => Date = () => new Date()
): Promise<PublicArticleIndex> {
  return runWithIndexQueue(indexKey, async () => {
    const index = await readPublicArticleIndexFromOss(indexKey, uploader, now);
    const articles = sortArticles([
      ...index.articles.filter((candidate) => candidate.slug !== entry.slug),
      entry
    ]);
    const nextIndex: PublicArticleIndex = {
      version: 1,
      generatedAt: now().toISOString(),
      articles
    };

    await uploader.upload({
      key: indexKey,
      body: `${JSON.stringify(nextIndex, null, 2)}\n`,
      contentType: "application/json"
    });

    return nextIndex;
  });
}

export async function writePublicArticleIndexToOss(
  indexKey: string,
  uploader: OssUploader,
  index: PublicArticleIndex
): Promise<void> {
  await uploader.upload({
    key: indexKey,
    body: `${JSON.stringify(index, null, 2)}\n`,
    contentType: "application/json"
  });
}
