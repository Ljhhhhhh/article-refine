import type { LinkProcessingConfig } from "../config/schema.js";
import type { NoteExtractor } from "./note-extractor.js";
import { MockNoteExtractor } from "./note-extractor.js";
import { TwoStepExtractor, type TwoStepExtractorOptions } from "./two-step-extractor.js";

export function createExtractor(llmConfig: LinkProcessingConfig["llm"] & { step1Model?: string; step2Model?: string; onProgress?: (step: string) => void }): NoteExtractor {
  switch (llmConfig.provider) {
    case "two-step": {
      const apiKey = llmConfig.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OpenAI API key required. Set OPENAI_API_KEY env var or apiKey in config.");
      }
      const baseUrl = llmConfig.baseUrl ?? process.env.OPENAI_BASE_URL;
      const step1Model = llmConfig.step1Model ?? process.env.LINK_PROCESSING_STEP1_MODEL ?? llmConfig.model;
      const step2Model = llmConfig.step2Model ?? process.env.LINK_PROCESSING_STEP2_MODEL ?? llmConfig.model;

      const options: TwoStepExtractorOptions = {
        step1: { apiKey, model: step1Model, baseUrl },
        step2: { apiKey, model: step2Model, baseUrl },
        onProgress: llmConfig.onProgress
      };
      return new TwoStepExtractor(options);
    }
    case "mock":
    default:
      return new MockNoteExtractor();
  }
}
