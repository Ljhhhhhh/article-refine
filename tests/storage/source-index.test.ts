import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  findSourceIndexEntry,
  normalizeSourceUrl,
  sourceUrlHash,
  upsertSourceIndexEntry
} from "../../src/storage/source-index.js";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(os.tmpdir(), "link-processing-source-index-"));
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("source index", () => {
  test("normalizes source URLs by removing hash fragments", () => {
    expect(normalizeSourceUrl("https://example.com/a?x=1#section")).toBe(
      "https://example.com/a?x=1"
    );
  });

  test("uses a stable short hash for a source URL", () => {
    expect(sourceUrlHash("https://example.com/a")).toBe(sourceUrlHash("https://example.com/a"));
    expect(sourceUrlHash("https://example.com/a")).toHaveLength(16);
  });

  test("upserts and finds an entry", async () => {
    await upsertSourceIndexEntry(vaultPath, {
      sourceUrl: "https://example.com/a",
      path: "/vault/文章摘要/综合/2026-05-09-a.md",
      title: "A",
      contentType: "综合",
      updatedAt: "2026-05-09T00:00:00.000Z"
    });

    const found = await findSourceIndexEntry(vaultPath, "https://example.com/a#part");

    expect(found?.title).toBe("A");
    expect(found?.urlHash).toBe(sourceUrlHash("https://example.com/a"));

    const raw = await readFile(path.join(vaultPath, ".link-processing", "source-index.json"), "utf8");
    expect(JSON.parse(raw).entries).toHaveLength(1);
  });
});
