import path from "node:path";
import YAML from "yaml";
import { resolveProcessConfig } from "../config/resolve-config.js";
import { AppError, type FailureResult, toFailureResult } from "../errors/errors.js";
import type { ContentTypeDirectory } from "../storage/file-naming.js";
import { OssUploader } from "../storage/oss-uploader.js";
import {
  estimateReadingTime,
  excerptFromText,
  plainTextFromMarkdown,
  sourceHostFromUrl,
  writePublicArticleIndexToOss,
  type PublicArticleEntry,
  type PublicArticleIndex
} from "../storage/public-index.js";

export type SyncReaderIndexResult =
  | {
      ok: true;
      command: "sync-reader-index";
      scanned: number;
      indexed: number;
      skipped: number;
      indexKey: string;
    }
  | FailureResult;

type Frontmatter = Record<string, unknown>;

const CONTENT_TYPES: ContentTypeDirectory[] = [
  "技术深度",
  "观点思考",
  "教程学习",
  "资讯动态",
  "综合"
];

function normalizePrefix(prefix: string): string {
  return prefix.replace(/^\/+|\/+$/g, "");
}

function objectKey(prefix: string, filename: string): string {
  const normalized = normalizePrefix(prefix);
  return normalized ? `${normalized}/${filename}` : filename;
}

function articleRootPrefix(prefix: string): string {
  return objectKey(prefix, "文章摘要/");
}

function slugFromKey(key: string): string {
  const basename = path.posix.basename(key);
  return basename.replace(/\.(md|markdown)$/i, "");
}

function parseFrontmatter(markdown: string): Frontmatter {
  if (!markdown.startsWith("---\n")) return {};
  const end = markdown.indexOf("\n---", 4);
  if (end === -1) return {};

  try {
    const parsed = YAML.parse(markdown.slice(4, end));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Frontmatter
      : {};
  } catch {
    return {};
  }
}

function markdownBody(markdown: string): string {
  if (!markdown.startsWith("---\n")) return markdown;
  const end = markdown.indexOf("\n---", 4);
  return end === -1 ? markdown : markdown.slice(end + 4).trimStart();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function contentTypeFromKey(key: string): ContentTypeDirectory {
  const parts = key.split("/");
  const markerIndex = parts.indexOf("文章摘要");
  const candidate = markerIndex >= 0 ? parts[markerIndex + 1] : undefined;
  return CONTENT_TYPES.includes(candidate as ContentTypeDirectory)
    ? candidate as ContentTypeDirectory
    : "综合";
}

function contentTypeFromFrontmatter(value: unknown, fallback: ContentTypeDirectory): ContentTypeDirectory {
  return CONTENT_TYPES.includes(value as ContentTypeDirectory)
    ? value as ContentTypeDirectory
    : fallback;
}

function titleFromKey(key: string): string {
  return slugFromKey(key).replace(/^\d{4}-\d{2}-\d{2}-/, "") || "未命名链接笔记";
}

function entryFromMarkdown(input: {
  key: string;
  markdown: string;
  lastModified?: Date;
  now: Date;
}): PublicArticleEntry {
  const frontmatter = parseFrontmatter(input.markdown);
  const fallbackContentType = contentTypeFromKey(input.key);
  const created = stringValue(frontmatter.created)
    ?? input.lastModified?.toISOString().slice(0, 10)
    ?? input.now.toISOString().slice(0, 10);
  const sourceUrl = stringValue(frontmatter.source_url) ?? "";
  const summary = stringValue(frontmatter.summary);
  const plainText = plainTextFromMarkdown(markdownBody(input.markdown));
  const excerpt = excerptFromText(summary || plainText);
  const sourceHost = sourceHostFromUrl(sourceUrl);

  return {
    slug: slugFromKey(input.key),
    title: stringValue(frontmatter.title) ?? titleFromKey(input.key),
    path: input.key,
    contentType: contentTypeFromFrontmatter(frontmatter.content_type, fallbackContentType),
    created,
    updatedAt: input.lastModified?.toISOString() ?? `${created}T00:00:00.000Z`,
    tags: stringArrayValue(frontmatter.tags).map((tag) => tag.replace(/^#/, "")),
    author: stringValue(frontmatter.author),
    sourceUrl,
    ...(summary ? { summary } : {}),
    ...(excerpt ? { excerpt } : {}),
    readingTime: estimateReadingTime(plainText),
    ...(sourceHost ? { sourceHost } : {})
  };
}

function sortArticles(articles: PublicArticleEntry[]): PublicArticleEntry[] {
  return [...articles].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function syncReaderIndex(input: {
  configPath?: string;
  now?: () => Date;
}): Promise<SyncReaderIndexResult> {
  try {
    const resolved = await resolveProcessConfig({
      configPath: input.configPath,
      cli: {},
      requireVault: false
    });
    if (!resolved.ok) return { ...resolved, command: "sync-reader-index" };

    const oss = resolved.config.storage.oss;
    if (!oss.enabled) {
      throw new AppError("OSS_CONFIG_INVALID", "OSS is not enabled.");
    }

    const uploader = new OssUploader({
      endpoint: oss.endpoint!,
      region: oss.region!,
      bucket: oss.bucket!,
      prefix: oss.prefix,
      accessKeyId: oss.accessKeyId!,
      secretAccessKey: oss.secretAccessKey!,
      forcePathStyle: oss.forcePathStyle
    });
    const now = input.now?.() ?? new Date();
    const keys = await uploader.listObjects(articleRootPrefix(oss.prefix));
    const markdownObjects = keys.filter((object) => /\.(md|markdown)$/i.test(object.key));
    const articles: PublicArticleEntry[] = [];

    for (const object of markdownObjects) {
      const markdown = await uploader.getObject(object.key);
      if (!markdown) continue;
      articles.push(entryFromMarkdown({
        key: object.key,
        markdown,
        lastModified: object.lastModified,
        now
      }));
    }

    const index: PublicArticleIndex = {
      version: 1,
      generatedAt: now.toISOString(),
      articles: sortArticles(articles)
    };
    const indexKey = objectKey(oss.prefix, "public-index.json");
    await writePublicArticleIndexToOss(indexKey, uploader, index);

    return {
      ok: true,
      command: "sync-reader-index",
      scanned: markdownObjects.length,
      indexed: articles.length,
      skipped: markdownObjects.length - articles.length,
      indexKey
    };
  } catch (error) {
    return toFailureResult(
      "sync-reader-index",
      error instanceof AppError
        ? error
        : new AppError(
            "OSS_UPLOAD_FAILED",
            error instanceof Error ? error.message : "Failed to sync reader index."
          )
    );
  }
}
