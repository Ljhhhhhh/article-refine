import type { LinkProcessingConfig } from "../config/schema.js";
import type { NoteExtractor } from "./note-extractor.js";
import { MockNoteExtractor } from "./note-extractor.js";
import { OpenAINoteExtractor, type OpenAIExtractorOptions } from "./openai-extractor.js";

export function createExtractor(llmConfig: LinkProcessingConfig["llm"]): NoteExtractor {
  switch (llmConfig.provider) {
    case "openai": {
      const apiKey = llmConfig.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          "OpenAI API key required. Set OPENAI_API_KEY env var or apiKey in config."
        );
      }
      const options: OpenAIExtractorOptions = {
        apiKey,
        model: llmConfig.model,
        baseUrl: llmConfig.baseUrl ?? process.env.OPENAI_BASE_URL
      };
      return new OpenAINoteExtractor(options);
    }
    case "mock":
    default:
      return new MockNoteExtractor();
  }
}
