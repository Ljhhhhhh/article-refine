import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { CompositeFetcher } from "../fetchers/composite-fetcher.js";
import type { ContentFetcher } from "../fetchers/fetcher.js";
import type { NoteExtractor } from "../llm/note-extractor.js";
import type { ContentType } from "../llm/schema.js";
import type { LinkType } from "../router/types.js";
import { saveObsidianNote, type SavedNote } from "../storage/obsidian-storage.js";
import { computeOssKey } from "../storage/oss-key.js";
import type { OssUploader, OssUploadResult } from "../storage/oss-uploader.js";
import { findSourceIndexEntry, upsertSourceIndexEntry } from "../storage/source-index.js";
import { renderStandardTemplate } from "../templates/standard-template.js";
import { routeLink } from "./route-link.js";

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
  obsidian: SavedNote;
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
  vaultPath: string;
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

export async function processLink(sourceUrl: string, options: ProcessOptions): Promise<ProcessResult> {
  const routed = routeLink(sourceUrl);
  if (!routed.ok) {
    return routed;
  }

  try {
    const duplicatePolicy = options.duplicatePolicy ?? "create";
    const existingEntry = await findSourceIndexEntry(options.vaultPath, sourceUrl);
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
      vaultPath: options.vaultPath,
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
        vaultPath: options.vaultPath,
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

    await upsertSourceIndexEntry(options.vaultPath, {
      sourceUrl,
      path: obsidian.path,
      title: note.title,
      contentType: note.contentType,
      updatedAt: now().toISOString()
    });

    return {
      ok: true,
      command: "process",
      sourceUrl,
      linkType: routed.linkType,
      contentType: note.contentType,
      title: note.title,
      obsidian,
      ...(ossOutcome ? { oss: ossOutcome } : {})
    };
  } catch (error) {
    return toFailureResult("process", error, sourceUrl);
  }
}
