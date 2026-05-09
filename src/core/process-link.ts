import { AppError, toFailureResult, type FailureResult } from "../errors/errors.js";
import { CompositeFetcher } from "../fetchers/composite-fetcher.js";
import type { ContentFetcher } from "../fetchers/fetcher.js";
import type { NoteExtractor } from "../llm/note-extractor.js";
import type { ContentType, ProcessedNote } from "../llm/schema.js";
import type { LinkType } from "../router/types.js";
import { saveObsidianNote, type SavedNote } from "../storage/obsidian-storage.js";
import { renderStandardTemplate } from "../templates/standard-template.js";
import { routeLink } from "./route-link.js";

export type ProcessSuccessResult = {
  ok: true;
  command: "process";
  sourceUrl: string;
  linkType: LinkType;
  contentType: ContentType;
  title: string;
  quality: ProcessedNote["quality"];
  obsidian: SavedNote;
};

export type ProcessResult = ProcessSuccessResult | FailureResult;

export type ProcessOptions = {
  vaultPath: string;
  fetchers: ContentFetcher[];
  extractor: NoteExtractor;
  qualityThreshold: number;
  now?: () => Date;
  onProgress?: (step: string) => void;
};

export async function processLink(sourceUrl: string, options: ProcessOptions): Promise<ProcessResult> {
  const routed = routeLink(sourceUrl);
  if (!routed.ok) {
    return routed;
  }

  try {
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
      now
    });

    return {
      ok: true,
      command: "process",
      sourceUrl,
      linkType: routed.linkType,
      contentType: note.contentType,
      title: note.title,
      quality: note.quality,
      obsidian
    };
  } catch (error) {
    return toFailureResult("process", error, sourceUrl);
  }
}
