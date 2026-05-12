import path from "node:path";
import { describe, expect, test } from "vitest";
import { computeOssKey, computeOssKeyFromParts } from "../../src/storage/oss-key.js";

describe("computeOssKey", () => {
  test("returns POSIX relative path with no prefix", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: "/tmp/vault/文章摘要/综合/2026-05-09-a.md",
      prefix: ""
    });
    expect(key).toBe("文章摘要/综合/2026-05-09-a.md");
  });

  test("joins prefix and trims leading and trailing slashes", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: "/tmp/vault/文章摘要/综合/2026-05-09-a.md",
      prefix: "/link-processing/"
    });
    expect(key).toBe("link-processing/文章摘要/综合/2026-05-09-a.md");
  });

  test("handles nested prefix segments", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: path.join("/tmp/vault", "文章摘要", "综合", "a.md"),
      prefix: "notes/obsidian"
    });
    expect(key).toBe("notes/obsidian/文章摘要/综合/a.md");
  });
});

describe("computeOssKeyFromParts", () => {
  test("returns key with no prefix", () => {
    const key = computeOssKeyFromParts({
      contentType: "综合",
      filename: "2026-05-07-Agent 工程文章.md",
      prefix: ""
    });
    expect(key).toBe("文章摘要/综合/2026-05-07-Agent 工程文章.md");
  });

  test("joins prefix and trims leading and trailing slashes", () => {
    const key = computeOssKeyFromParts({
      contentType: "技术深度",
      filename: "2026-05-07-test.md",
      prefix: "/link-processing/"
    });
    expect(key).toBe("link-processing/文章摘要/技术深度/2026-05-07-test.md");
  });

  test("handles nested prefix segments", () => {
    const key = computeOssKeyFromParts({
      contentType: "综合",
      filename: "a.md",
      prefix: "notes/obsidian"
    });
    expect(key).toBe("notes/obsidian/文章摘要/综合/a.md");
  });
});
