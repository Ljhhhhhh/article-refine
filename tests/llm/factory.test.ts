import { describe, expect, test } from "vitest";
import { createExtractor } from "../../src/llm/factory.js";
import { DraftReviseExtractor } from "../../src/llm/draft-revise-extractor.js";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("createExtractor", () => {
  test("creates mock extractor for mock provider", () => {
    const extractor = createExtractor({
      provider: "mock",
      model: "mock",
      longContentThreshold: 32000
    });

    expect(extractor).toBeInstanceOf(MockNoteExtractor);
  });

  test("treats openai as a compatibility alias for draft-revise", () => {
    const extractor = createExtractor({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key",
      longContentThreshold: 32000
    });

    expect(extractor).toBeInstanceOf(DraftReviseExtractor);
  });

  test("throws for unsupported provider instead of silently returning mock", () => {
    expect(() =>
      createExtractor({
        provider: "unsupported-provider",
        model: "gpt-4o",
        apiKey: "test-key",
        longContentThreshold: 32000
      })
    ).toThrow("Unsupported LLM provider");
  });
});
