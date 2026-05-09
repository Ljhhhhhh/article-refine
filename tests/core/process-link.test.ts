import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { processLink } from "../../src/core/process-link.js";
import type { ContentFetcher } from "../../src/fetchers/fetcher.js";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";
import type { OssUploadResult, OssUploader } from "../../src/storage/oss-uploader.js";
import { AppError } from "../../src/errors/errors.js";

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
    if (result.ok && "obsidian" in result) {
      expect(result.command).toBe("process");
      expect(result.linkType).toBe("tech_blog");
      expect(result.contentType).toBe("综合");
      expect(result.obsidian.saved).toBe(true);
      expect(result.obsidian.path).toContain(path.join("文章摘要", "综合"));
      await expect(readFile(result.obsidian.path, "utf8")).resolves.toContain("# Agent 工程文章");
    }
  });

  test("skips existing source when duplicatePolicy is skip", async () => {
    const first = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      duplicatePolicy: "create",
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(first.ok).toBe(true);

    const second = await processLink("https://example.dev/agent#section", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      duplicatePolicy: "skip",
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(second.ok).toBe(true);
    if (second.ok && "skipped" in second) {
      expect(second.skipped).toBe(true);
      expect(second.existingPath).toContain("2026-05-07-Agent 工程文章.md");
    } else {
      throw new Error("Expected skipped duplicate result.");
    }
  });

  test("updates existing note when duplicatePolicy is update", async () => {
    const first = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      duplicatePolicy: "create",
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(first.ok).toBe(true);
    const firstPath = first.ok && "obsidian" in first ? first.obsidian.path : "";

    const second = await processLink("https://example.dev/agent#fragment", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      duplicatePolicy: "update",
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(second.ok).toBe(true);
    if (second.ok && "obsidian" in second) {
      expect(second.obsidian.path).toBe(firstPath);
    } else {
      throw new Error("Expected successful update result.");
    }
  });
});

function makeUploader(behavior: "ok" | "fail"): OssUploader {
  return {
    upload: async ({ key }: { key: string }): Promise<OssUploadResult> => {
      if (behavior === "fail") {
        throw new AppError("OSS_UPLOAD_FAILED", "boom");
      }
      return {
        bucket: "bucket",
        key,
        url: `oss://bucket/${key}`,
        httpsUrl: `https://bucket.example.com/${key}`,
        etag: "\"deadbeef\""
      };
    },
    head: async () => {}
  } as unknown as OssUploader;
}

describe("processLink OSS mirror", () => {
  test("attaches uploaded oss result on success", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("ok"),
        prefix: "notes",
        strict: false
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok && "obsidian" in result) {
      expect(result.oss).toMatchObject({
        uploaded: true,
        bucket: "bucket",
        url: expect.stringContaining("oss://bucket/notes/文章摘要")
      });
    }
  });

  test("degrades to warning when oss upload fails and strict is false", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("fail"),
        prefix: "",
        strict: false
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok && "obsidian" in result) {
      expect(result.oss).toMatchObject({
        uploaded: false,
        error: { code: "OSS_UPLOAD_FAILED" }
      });
      await expect(readFile(result.obsidian.path, "utf8")).resolves.toContain("# Agent 工程文章");
    }
  });

  test("returns failure when oss upload fails and strict is true", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("fail"),
        prefix: "",
        strict: true
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OSS_UPLOAD_FAILED");
    }
  });
});
