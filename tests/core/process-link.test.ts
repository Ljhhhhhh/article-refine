import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { processLink } from "../../src/core/process-link.js";
import type { ContentFetcher } from "../../src/fetchers/fetcher.js";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(os.tmpdir(), "link-processing-process-"));
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

const fakeFetcher: ContentFetcher = {
  name: "fake",
  canFetch: () => true,
  fetch: async ({ sourceUrl }) => ({
    sourceUrl,
    title: "Agent 工程文章",
    author: "Author",
    rawText: "架构 API 性能 部署 Agent LLM 大模型 ".repeat(50),
    metadata: {}
  })
};

describe("processLink", () => {
  test("routes, fetches, extracts, renders, and saves to Obsidian", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toBe("process");
      expect(result.linkType).toBe("tech_blog");
      expect(result.contentType).toBe("技术深度");
      expect(result.obsidian.saved).toBe(true);
      expect(result.obsidian.path).toContain(path.join("文章摘要", "技术深度"));
      await expect(readFile(result.obsidian.path, "utf8")).resolves.toContain("# Agent 工程文章");
    }
  });
});
