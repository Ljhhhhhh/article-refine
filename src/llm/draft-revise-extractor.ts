import type { ExtractNoteInput, NoteExtractor } from "./note-extractor.js";
import type { ProcessedNote } from "./schema.js";
import { DraftGenerator, type DraftGeneratorOptions } from "./draft-generator.js";
import { Reviser, type ReviserOptions } from "./reviser.js";
import { compressIfLong } from "./long-content-compressor.js";

export type DraftReviseExtractorOptions = {
  draft: DraftGeneratorOptions;
  revise: ReviserOptions;
  compressor: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  };
  longContentThreshold?: number;
  skipRevise?: boolean;
  onProgress?: (step: string) => void;
};

export class DraftReviseExtractor implements NoteExtractor {
  private draftGenerator: DraftGenerator;
  private reviser: Reviser;
  private compressorConfig: DraftReviseExtractorOptions["compressor"];
  private longContentThreshold: number;
  private skipRevise: boolean;
  private onProgress?: (step: string) => void;

  constructor(options: DraftReviseExtractorOptions) {
    this.draftGenerator = new DraftGenerator(options.draft);
    this.reviser = new Reviser(options.revise);
    this.compressorConfig = options.compressor;
    this.longContentThreshold = options.longContentThreshold ?? 32000;
    this.skipRevise = options.skipRevise ?? false;
    this.onProgress = options.onProgress;
  }

  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    this.onProgress?.("preparing");
    const preparedMarkdown = await compressIfLong(input.rawText, {
      maxChars: this.longContentThreshold,
      apiKey: this.compressorConfig.apiKey,
      model: this.compressorConfig.model,
      baseUrl: this.compressorConfig.baseUrl
    });

    this.onProgress?.("drafting");
    const draft = await this.draftGenerator.generate({
      sourceUrl: input.sourceUrl,
      title: input.title,
      author: input.author,
      rawText: preparedMarkdown
    });

    if (this.skipRevise) {
      return draft;
    }

    this.onProgress?.("revising");
    const revised = await this.reviser.revise({
      originalMarkdown: input.rawText,
      draft
    });

    return revised;
  }
}
