import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { CompositeFetcher } from "../fetchers/composite-fetcher.js";
import type { ContentFetcher } from "../fetchers/fetcher.js";
import type { NoteExtractor } from "../llm/note-extractor.js";
import type { ContentType } from "../llm/schema.js";
import type { LinkType, RoutedLink } from "../router/types.js";
import { generateNoteFilename, saveObsidianNote, type SavedNote } from "../storage/obsidian-storage.js";
import { computeOssKey, computeOssKeyFromParts } from "../storage/oss-key.js";
import type { OssUploader, OssUploadResult } from "../storage/oss-uploader.js";
import {
  estimateReadingTime,
  excerptFromText,
  plainTextFromMarkdown,
  sourceHostFromUrl,
  upsertPublicArticleIndexInOss,
  type PublicArticleEntry
} from "../storage/public-index.js";
import { findSourceIndexEntry, findSourceIndexEntryFromOss, upsertSourceIndexEntry, upsertSourceIndexEntryInOss } from "../storage/source-index.js";
import { renderStandardTemplate } from "../templates/standard-template.js";
import { routeLink } from "./route-link.js";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type DuplicatePolicy = "create" | "skip" | "update";

export type ProcessOssResult =
  | {
      uploaded: true;
      bucket: string;
      key: string;
      url: string;
      httpsUrl: string;
      etag?: string;
    }
  | {
      uploaded: false;
      error: { code: "OSS_UPLOAD_FAILED"; message: string };
    };

export type ProcessSuccessResult = {
  ok: true;
  command: "process";
  sourceUrl: string;
  linkType: LinkType;
  contentType: ContentType;
  title: string;
  clickbaitIndex: number;
  obsidian?: SavedNote;
  oss?: ProcessOssResult;
};

export type ProcessSkippedResult = {
  ok: true;
  command: "process";
  sourceUrl: string;
  skipped: true;
  reason: "SOURCE_ALREADY_EXISTS";
  existingPath: string;
};

export type ProcessResult = ProcessSuccessResult | ProcessSkippedResult | FailureResult;

export type ProcessOptions = {
  vaultPath?: string;
  mode?: "mirror" | "only";
  fetchers: ContentFetcher[];
  extractor: NoteExtractor;
  qualityThreshold: number;
  now?: () => Date;
  onProgress?: (step: string) => void;
  duplicatePolicy?: DuplicatePolicy;
  oss?: {
    uploader: OssUploader;
    prefix: string;
    strict: boolean;
  };
};

function ossIndexKey(prefix: string, filename: string): string {
  const normalized = prefix.replace(/^\/+|\/+$/g, "");
  return normalized ? `${normalized}/${filename}` : filename;
}

function slugFromFilename(filename: string): string {
  return path.basename(filename, path.extname(filename));
}

function publicArticleEntry(input: {
  slug: string;
  title: string;
  path: string;
  contentType: ContentType;
  created: string;
  updatedAt: string;
  tags: string[];
  author?: string;
  sourceUrl: string;
  summary?: string;
  markdown: string;
}): PublicArticleEntry {
  const plainText = plainTextFromMarkdown(input.markdown);
  const summary = input.summary?.trim();
  const excerpt = excerptFromText(summary || plainText);
  const sourceHost = sourceHostFromUrl(input.sourceUrl);
  return {
    slug: input.slug,
    title: input.title,
    path: input.path,
    contentType: input.contentType,
    created: input.created,
    updatedAt: input.updatedAt,
    tags: input.tags,
    author: input.author,
    sourceUrl: input.sourceUrl,
    ...(summary ? { summary } : {}),
    ...(excerpt ? { excerpt } : {}),
    readingTime: estimateReadingTime(plainText),
    ...(sourceHost ? { sourceHost } : {})
  };
}

async function upsertPublicArticleIndexIfUploaded(input: {
  uploaded: boolean;
  strict: boolean;
  uploader: OssUploader;
  prefix: string;
  entry: Parameters<typeof upsertPublicArticleIndexInOss>[2];
  now: () => Date;
}): Promise<void> {
  if (!input.uploaded) return;

  try {
    await upsertPublicArticleIndexInOss(
      ossIndexKey(input.prefix, "public-index.json"),
      input.uploader,
      input.entry,
      input.now
    );
  } catch (error) {
    if (input.strict) throw error;
  }
}

export async function processLink(sourceUrl: string, options: ProcessOptions): Promise<ProcessResult> {
  if (isLocalFile(sourceUrl)) {
    return processLocalFile(sourceUrl, options);
  }

  const routed = routeLink(sourceUrl);
  if (!routed.ok) {
    return routed;
  }

  const isOssOnly = options.mode === "only" && !!options.oss;

  try {
    const duplicatePolicy = options.duplicatePolicy ?? "create";

    if (isOssOnly) {
      return await processOssOnly(sourceUrl, routed, options, duplicatePolicy);
    }

    return await processMirror(sourceUrl, routed, options, duplicatePolicy);
  } catch (error) {
    return toFailureResult("process", error, sourceUrl);
  }
}

async function processOssOnly(
  sourceUrl: string,
  routed: RoutedLink,
  options: ProcessOptions,
  duplicatePolicy: DuplicatePolicy
): Promise<ProcessResult> {
  const oss = options.oss!;
  const ossSourceIndexKey = oss.prefix ? `${oss.prefix.replace(/^\/+|\/+$/g, "")}/source-index.json` : "source-index.json";

  const existingEntry = await findSourceIndexEntryFromOss(ossSourceIndexKey, oss.uploader, sourceUrl);
  if (existingEntry && duplicatePolicy === "skip") {
    return {
      ok: true,
      command: "process",
      sourceUrl,
      skipped: true,
      reason: "SOURCE_ALREADY_EXISTS",
      existingPath: existingEntry.path
    };
  }

  options.onProgress?.("fetching");
  const fetched = await new CompositeFetcher(options.fetchers).fetch(routed);
  if (routed.linkType !== "video" && fetched.rawText.length < options.qualityThreshold) {
    throw new AppError("CONTENT_TOO_SHORT", "Fetched content is below the quality threshold.");
  }

  options.onProgress?.("extracting");
  const note = await options.extractor.extract({
    sourceUrl,
    linkType: routed.linkType,
    title: fetched.title,
    author: fetched.author,
    rawText: fetched.rawText
  });
  const now = options.now ?? (() => new Date());
  const markdown = renderStandardTemplate({
    note,
    sourceUrl,
    author: fetched.author,
    createdAt: now(),
    fetchedAt: now()
  });

  options.onProgress?.("uploading");
  const filename = generateNoteFilename({ title: note.title, contentType: note.contentType, now });
  const key = computeOssKeyFromParts({ contentType: note.contentType, filename, prefix: oss.prefix });

  let ossOutcome: ProcessOssResult;
  try {
    const uploaded: OssUploadResult = await oss.uploader.upload({ key, body: markdown });
    ossOutcome = {
      uploaded: true,
      bucket: uploaded.bucket,
      key: uploaded.key,
      url: uploaded.url,
      httpsUrl: uploaded.httpsUrl,
      etag: uploaded.etag
    };
  } catch (error) {
    if (oss.strict) {
      throw error;
    }
    const err = error instanceof AppError
      ? error
      : new AppError("OSS_UPLOAD_FAILED", error instanceof Error ? error.message : "OSS upload failed.");
    ossOutcome = {
      uploaded: false,
      error: { code: "OSS_UPLOAD_FAILED", message: err.message }
    };
  }

  if (ossOutcome.uploaded) {
    await upsertSourceIndexEntryInOss(ossSourceIndexKey, oss.uploader, {
      sourceUrl,
      path: key,
      title: note.title,
      contentType: note.contentType,
      updatedAt: now().toISOString()
    });
    await upsertPublicArticleIndexIfUploaded({
      uploaded: true,
      strict: oss.strict,
      uploader: oss.uploader,
      prefix: oss.prefix,
      entry: publicArticleEntry({
        slug: slugFromFilename(filename),
        title: note.title,
        path: key,
        contentType: note.contentType,
        created: now().toISOString().slice(0, 10),
        updatedAt: now().toISOString(),
        tags: note.tags.map((tag) => tag.replace(/^#/, "")),
        author: fetched.author,
        sourceUrl,
        summary: note.summary,
        markdown
      }),
      now
    });
  }

  return {
    ok: true,
    command: "process",
    sourceUrl,
    linkType: routed.linkType,
    contentType: note.contentType,
    title: note.title,
    clickbaitIndex: note.clickbaitIndex,
    oss: ossOutcome
  };
}

async function processMirror(
  sourceUrl: string,
  routed: RoutedLink,
  options: ProcessOptions,
  duplicatePolicy: DuplicatePolicy
): Promise<ProcessResult> {
  const existingEntry = options.vaultPath
    ? await findSourceIndexEntry(options.vaultPath, sourceUrl)
    : undefined;
  if (existingEntry && duplicatePolicy === "skip") {
    return {
      ok: true,
      command: "process",
      sourceUrl,
      skipped: true,
      reason: "SOURCE_ALREADY_EXISTS",
      existingPath: existingEntry.path
    };
  }

  options.onProgress?.("fetching");
  const fetched = await new CompositeFetcher(options.fetchers).fetch(routed);
  if (routed.linkType !== "video" && fetched.rawText.length < options.qualityThreshold) {
    throw new AppError("CONTENT_TOO_SHORT", "Fetched content is below the quality threshold.");
  }

  options.onProgress?.("extracting");
  const note = await options.extractor.extract({
    sourceUrl,
    linkType: routed.linkType,
    title: fetched.title,
    author: fetched.author,
    rawText: fetched.rawText
  });
  const now = options.now ?? (() => new Date());
  const markdown = renderStandardTemplate({
    note,
    sourceUrl,
    author: fetched.author,
    createdAt: now(),
    fetchedAt: now()
  });
  options.onProgress?.("saving");
  const obsidian = await saveObsidianNote({
    vaultPath: options.vaultPath!,
    title: note.title,
    contentType: note.contentType,
    markdown,
    tags: note.tags,
    now,
    existingPath: existingEntry && duplicatePolicy === "update" ? existingEntry.path : undefined
  });

  let ossOutcome: ProcessOssResult | undefined;
  if (options.oss) {
    options.onProgress?.("mirroring");
    const key = computeOssKey({
      vaultPath: options.vaultPath!,
      savedPath: obsidian.path,
      prefix: options.oss.prefix
    });
    try {
      const uploaded: OssUploadResult = await options.oss.uploader.upload({
        key,
        body: markdown
      });
      ossOutcome = {
        uploaded: true,
        bucket: uploaded.bucket,
        key: uploaded.key,
        url: uploaded.url,
        httpsUrl: uploaded.httpsUrl,
        etag: uploaded.etag
      };
    } catch (error) {
      if (options.oss.strict) {
        throw error;
      }
      const err = error instanceof AppError
        ? error
        : new AppError("OSS_UPLOAD_FAILED", error instanceof Error ? error.message : "OSS upload failed.");
      ossOutcome = {
        uploaded: false,
        error: { code: "OSS_UPLOAD_FAILED", message: err.message }
      };
    }
  }

  await upsertSourceIndexEntry(options.vaultPath!, {
    sourceUrl,
    path: obsidian.path,
    title: note.title,
    contentType: note.contentType,
    updatedAt: now().toISOString()
  });

  if (options.oss && ossOutcome?.uploaded) {
    await upsertPublicArticleIndexIfUploaded({
      uploaded: true,
      strict: options.oss.strict,
      uploader: options.oss.uploader,
      prefix: options.oss.prefix,
      entry: publicArticleEntry({
        slug: slugFromFilename(path.basename(obsidian.path)),
        title: note.title,
        path: ossOutcome.key,
        contentType: note.contentType,
        created: now().toISOString().slice(0, 10),
        updatedAt: now().toISOString(),
        tags: note.tags.map((tag) => tag.replace(/^#/, "")),
        author: fetched.author,
        sourceUrl,
        summary: note.summary,
        markdown
      }),
      now
    });
  }

  return {
    ok: true,
    command: "process",
    sourceUrl,
    linkType: routed.linkType,
    contentType: note.contentType,
    title: note.title,
    clickbaitIndex: note.clickbaitIndex,
    obsidian,
    ...(ossOutcome ? { oss: ossOutcome } : {})
  };
}

function isLocalFile(source: string): boolean {
  return !source.startsWith("http://") && !source.startsWith("https://")
    && (source.endsWith(".md") || source.endsWith(".markdown"));
}

async function processLocalFile(filePath: string, options: ProcessOptions): Promise<ProcessResult> {
  const absPath = path.resolve(filePath);
  const sourceUrl = `file://${absPath}`;

  try {
    await stat(absPath);
  } catch {
    throw new AppError("FILE_NOT_FOUND", `Local file not found: ${absPath}`);
  }

  const rawText = await readFile(absPath, "utf8");
  if (rawText.length < options.qualityThreshold) {
    throw new AppError("CONTENT_TOO_SHORT", "File content is below the quality threshold.");
  }

  const title = path.basename(absPath, path.extname(absPath));

  options.onProgress?.("extracting");
  const note = await options.extractor.extract({
    sourceUrl,
    linkType: "general",
    title,
    rawText
  });

  const now = options.now ?? (() => new Date());
  const markdown = renderStandardTemplate({
    note,
    sourceUrl,
    author: undefined,
    createdAt: now(),
    fetchedAt: now()
  });

  const isOssOnly = options.mode === "only" && !!options.oss;

  if (isOssOnly) {
    const oss = options.oss!;
    const ossSourceIndexKey = oss.prefix ? `${oss.prefix.replace(/^\/+|\/+$/g, "")}/source-index.json` : "source-index.json";

    options.onProgress?.("uploading");
    const filename = generateNoteFilename({ title: note.title, contentType: note.contentType, now });
    const key = computeOssKeyFromParts({ contentType: note.contentType, filename, prefix: oss.prefix });

    let ossOutcome: ProcessOssResult;
    try {
      const uploaded: OssUploadResult = await oss.uploader.upload({ key, body: markdown });
      ossOutcome = {
        uploaded: true,
        bucket: uploaded.bucket,
        key: uploaded.key,
        url: uploaded.url,
        httpsUrl: uploaded.httpsUrl,
        etag: uploaded.etag
      };
    } catch (error) {
      if (oss.strict) {
        throw error;
      }
      const err = error instanceof AppError
        ? error
        : new AppError("OSS_UPLOAD_FAILED", error instanceof Error ? error.message : "OSS upload failed.");
      ossOutcome = {
        uploaded: false,
        error: { code: "OSS_UPLOAD_FAILED", message: err.message }
      };
    }

    if (ossOutcome.uploaded) {
      await upsertSourceIndexEntryInOss(ossSourceIndexKey, oss.uploader, {
        sourceUrl,
        path: key,
        title: note.title,
        contentType: note.contentType,
        updatedAt: now().toISOString()
      });
      await upsertPublicArticleIndexIfUploaded({
        uploaded: true,
        strict: oss.strict,
        uploader: oss.uploader,
        prefix: oss.prefix,
        entry: publicArticleEntry({
          slug: slugFromFilename(filename),
          title: note.title,
          path: key,
          contentType: note.contentType,
          created: now().toISOString().slice(0, 10),
          updatedAt: now().toISOString(),
          tags: note.tags.map((tag) => tag.replace(/^#/, "")),
          sourceUrl,
          summary: note.summary,
          markdown
        }),
        now
      });
    }

    return {
      ok: true,
      command: "process",
      sourceUrl,
      linkType: "general",
      contentType: note.contentType,
      title: note.title,
      clickbaitIndex: note.clickbaitIndex,
      oss: ossOutcome
    };
  }

  options.onProgress?.("saving");
  const obsidian = await saveObsidianNote({
    vaultPath: options.vaultPath!,
    title: note.title,
    contentType: note.contentType,
    markdown,
    tags: note.tags,
    now
  });

  let ossOutcome: ProcessOssResult | undefined;
  if (options.oss) {
    options.onProgress?.("mirroring");
    const key = computeOssKey({
      vaultPath: options.vaultPath!,
      savedPath: obsidian.path,
      prefix: options.oss.prefix
    });
    try {
      const uploaded: OssUploadResult = await options.oss.uploader.upload({
        key,
        body: markdown
      });
      ossOutcome = {
        uploaded: true,
        bucket: uploaded.bucket,
        key: uploaded.key,
        url: uploaded.url,
        httpsUrl: uploaded.httpsUrl,
        etag: uploaded.etag
      };
    } catch (error) {
      if (options.oss.strict) {
        throw error;
      }
      const err = error instanceof AppError
        ? error
        : new AppError("OSS_UPLOAD_FAILED", error instanceof Error ? error.message : "OSS upload failed.");
      ossOutcome = {
        uploaded: false,
        error: { code: "OSS_UPLOAD_FAILED", message: err.message }
      };
    }
  }

  await upsertSourceIndexEntry(options.vaultPath!, {
    sourceUrl,
    path: obsidian.path,
    title: note.title,
    contentType: note.contentType,
    updatedAt: now().toISOString()
  });

  if (options.oss && ossOutcome?.uploaded) {
    await upsertPublicArticleIndexIfUploaded({
      uploaded: true,
      strict: options.oss.strict,
      uploader: options.oss.uploader,
      prefix: options.oss.prefix,
      entry: publicArticleEntry({
        slug: slugFromFilename(path.basename(obsidian.path)),
        title: note.title,
        path: ossOutcome.key,
        contentType: note.contentType,
        created: now().toISOString().slice(0, 10),
        updatedAt: now().toISOString(),
        tags: note.tags.map((tag) => tag.replace(/^#/, "")),
        sourceUrl,
        summary: note.summary,
        markdown
      }),
      now
    });
  }

  return {
    ok: true,
    command: "process",
    sourceUrl,
    linkType: "general",
    contentType: note.contentType,
    title: note.title,
    clickbaitIndex: note.clickbaitIndex,
    obsidian,
    ...(ossOutcome ? { oss: ossOutcome } : {})
  };
}
