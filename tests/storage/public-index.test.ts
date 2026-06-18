import { describe, expect, test } from "vitest";
import type { OssUploadResult, OssUploader } from "../../src/storage/oss-uploader.js";
import {
  estimateReadingTime,
  excerptFromText,
  plainTextFromMarkdown,
  readPublicArticleIndexFromOss,
  sourceHostFromUrl,
  upsertPublicArticleIndexInOss,
  type PublicArticleEntry
} from "../../src/storage/public-index.js";

function makeUploader(initial: Record<string, string> = {}): OssUploader & {
  objects: Record<string, string>;
  uploads: Array<{ key: string; contentType?: string }>;
} {
  const objects = { ...initial };
  const uploads: Array<{ key: string; contentType?: string }> = [];
  const uploader: any = {
    objects,
    uploads,
    upload: async (input: {
      key: string;
      body: string | Uint8Array;
      contentType?: string;
    }): Promise<OssUploadResult> => {
      objects[input.key] = typeof input.body === "string"
        ? input.body
        : Buffer.from(input.body).toString("utf8");
      uploads.push({ key: input.key, contentType: input.contentType });
      return {
        bucket: "bucket",
        key: input.key,
        url: `oss://bucket/${input.key}`,
        httpsUrl: `https://bucket.example.com/${input.key}`
      };
    },
    head: async () => {},
    getObject: async (key: string) => objects[key]
  };
  return uploader as OssUploader & {
    objects: Record<string, string>;
    uploads: Array<{ key: string; contentType?: string }>;
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

const baseEntry: PublicArticleEntry = {
  slug: "2026-06-17-agent-engineering",
  title: "Agent 工程文章",
  path: "notes/文章摘要/综合/2026-06-17-Agent 工程文章.md",
  contentType: "综合",
  created: "2026-06-17",
  updatedAt: "2026-06-17T00:00:00.000Z",
  tags: ["AI", "工程"],
  author: "未知",
  sourceUrl: "https://example.com/article",
  summary: "文章介绍了 Agent 工程化的核心实践。",
  excerpt: "文章介绍了 Agent 工程化的核心实践。",
  readingTime: 1,
  sourceHost: "example.com"
};

describe("public article index", () => {
  test("returns an empty index when the OSS object does not exist", async () => {
    const uploader = makeUploader();

    const index = await readPublicArticleIndexFromOss(
      "notes/public-index.json",
      uploader,
      () => new Date("2026-06-17T10:00:00.000Z")
    );

    expect(index).toEqual({
      version: 1,
      generatedAt: "2026-06-17T10:00:00.000Z",
      articles: []
    });
  });

  test("upserts entries by slug and uploads JSON", async () => {
    const uploader = makeUploader();

    await upsertPublicArticleIndexInOss(
      "notes/public-index.json",
      uploader,
      baseEntry,
      () => new Date("2026-06-17T10:00:00.000Z")
    );
    const updated = await upsertPublicArticleIndexInOss(
      "notes/public-index.json",
      uploader,
      { ...baseEntry, title: "更新后的标题", updatedAt: "2026-06-18T00:00:00.000Z" },
      () => new Date("2026-06-18T10:00:00.000Z")
    );

    expect(updated.articles).toHaveLength(1);
    expect(updated.articles[0].title).toBe("更新后的标题");
    expect(uploader.uploads.at(-1)).toEqual({
      key: "notes/public-index.json",
      contentType: "application/json"
    });
    expect(JSON.parse(uploader.objects["notes/public-index.json"]).articles).toHaveLength(1);
  });

  test("sorts entries by updatedAt descending", async () => {
    const uploader = makeUploader();

    const oldest: PublicArticleEntry = {
      ...baseEntry,
      slug: "old",
      title: "Old",
      updatedAt: "2026-06-15T00:00:00.000Z"
    };
    const newest: PublicArticleEntry = {
      ...baseEntry,
      slug: "new",
      title: "New",
      updatedAt: "2026-06-17T00:00:00.000Z"
    };
    const middle: PublicArticleEntry = {
      ...baseEntry,
      slug: "middle",
      title: "Middle",
      updatedAt: "2026-06-16T00:00:00.000Z"
    };

    await upsertPublicArticleIndexInOss("public-index.json", uploader, oldest);
    await upsertPublicArticleIndexInOss("public-index.json", uploader, newest);
    const index = await upsertPublicArticleIndexInOss("public-index.json", uploader, middle);

    expect(index.articles.map((article) => article.slug)).toEqual(["new", "middle", "old"]);
  });

  test("serializes concurrent upserts for the same index key", async () => {
    const firstUpload = deferred<void>();
    let uploadCount = 0;
    const objects: Record<string, string> = {};
    const uploader: any = {
      upload: async (input: { key: string; body: string; contentType?: string }): Promise<OssUploadResult> => {
        uploadCount += 1;
        if (uploadCount === 1) {
          await firstUpload.promise;
        }
        objects[input.key] = input.body;
        return {
          bucket: "bucket",
          key: input.key,
          url: `oss://bucket/${input.key}`,
          httpsUrl: `https://bucket.example.com/${input.key}`
        };
      },
      head: async () => {},
      getObject: async (key: string) => objects[key]
    };

    const first = upsertPublicArticleIndexInOss(
      "public-index.json",
      uploader,
      { ...baseEntry, slug: "first", title: "First", updatedAt: "2026-06-17T00:00:00.000Z" }
    );
    const second = upsertPublicArticleIndexInOss(
      "public-index.json",
      uploader,
      { ...baseEntry, slug: "second", title: "Second", updatedAt: "2026-06-18T00:00:00.000Z" }
    );

    await Promise.resolve();
    firstUpload.resolve();
    await Promise.all([first, second]);

    const stored = JSON.parse(objects["public-index.json"]);
    expect(stored.articles.map((article: PublicArticleEntry) => article.slug)).toEqual([
      "second",
      "first"
    ]);
  });

  test("derives reader metadata helpers", () => {
    expect(sourceHostFromUrl("https://www.example.com/path")).toBe("example.com");
    expect(sourceHostFromUrl("not a url")).toBeUndefined();
    expect(plainTextFromMarkdown("---\ntitle: T\n---\n\n## 标题\n\n正文 [链接](https://example.com)。")).toBe("标题 正文 链接。");
    expect(excerptFromText("  一段 摘要  ", 10)).toBe("一段 摘要");
    expect(excerptFromText("12345678901", 10)).toBe("1234567890…");
    expect(estimateReadingTime("字".repeat(501))).toBe(2);
  });
});
