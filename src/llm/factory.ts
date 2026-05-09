import type { LinkProcessingConfig } from "../config/schema.js";
import type { NoteExtractor } from "./note-extractor.js";
import { MockNoteExtractor } from "./note-extractor.js";
import { DraftReviseExtractor, type DraftReviseExtractorOptions } from "./draft-revise-extractor.js";

export type CreateExtractorInput = LinkProcessingConfig["llm"] & {
  draftModel?: string;
  reviseModel?: string;
  onProgress?: (step: string) => void;
};

export function createExtractor(llmConfig: CreateExtractorInput): NoteExtractor {
  const provider = llmConfig.provider;

  // "two-step" is kept as a backward-compatible alias for "draft-revise"
  if (provider === "draft-revise" || provider === "two-step") {
    const apiKey = llmConfig.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key required. Set OPENAI_API_KEY env var or apiKey in config."
      );
    }
    const baseUrl = llmConfig.baseUrl ?? process.env.OPENAI_BASE_URL;
    const draftModel =
      llmConfig.draftModel ??
      process.env.LINK_PROCESSING_DRAFT_MODEL ??
      llmConfig.model;
    const reviseModel =
      llmConfig.reviseModel ??
      process.env.LINK_PROCESSING_REVISE_MODEL ??
      llmConfig.model;

    const options: DraftReviseExtractorOptions = {
      draft: { apiKey, model: draftModel, baseUrl },
      revise: { apiKey, model: reviseModel, baseUrl },
      compressor: { apiKey, model: draftModel, baseUrl },
      longContentThreshold: llmConfig.longContentThreshold,
      onProgress: llmConfig.onProgress
    };
    return new DraftReviseExtractor(options);
  }

  return new MockNoteExtractor();
}
