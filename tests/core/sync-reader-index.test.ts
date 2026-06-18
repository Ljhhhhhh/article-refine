import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { syncReaderIndex } from "../../src/core/sync-reader-index.js";

const s3Mock = mockClient(S3Client);
const savedEnv = { ...process.env };

beforeEach(() => {
  s3Mock.reset();
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.OSS_ENDPOINT;
  delete process.env.OSS_REGION;
  delete process.env.OSS_BUCKET;
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_SECRET_ACCESS_KEY;
  delete process.env.OSS_PREFIX;
  process.env.OSS_ENDPOINT = "https://s3.oss-cn-hangzhou.aliyuncs.com";
  process.env.OSS_REGION = "cn-hangzhou";
  process.env.OSS_BUCKET = "my-bucket";
  process.env.OSS_ACCESS_KEY_ID = "id";
  process.env.OSS_SECRET_ACCESS_KEY = "secret";
  process.env.OSS_PREFIX = "notes";
});

afterEach(() => {
  s3Mock.reset();
  process.env = { ...savedEnv };
});

function body(markdown: string) {
  return {
    transformToString: async () => markdown
  };
}

describe("syncReaderIndex", () => {
  test("rebuilds public index from existing OSS markdown", async () => {
    s3Mock.on(ListObjectsV2Command).resolves({
      IsTruncated: false,
      Contents: [
        {
          Key: "notes/文章摘要/综合/2026-06-17-Agent 工程文章.md",
          LastModified: new Date("2026-06-17T12:00:00.000Z")
        },
        {
          Key: "notes/文章摘要/综合/not-markdown.txt",
          LastModified: new Date("2026-06-18T12:00:00.000Z")
        }
      ]
    });
    s3Mock.on(GetObjectCommand).resolves({
      Body: body([
        "---",
        "title: Agent 工程文章",
        "summary: 文章介绍了 Agent 工程文章的本地预览和 OSS 阅读站流程。",
        "source_url: https://example.dev/agent",
        "author: Author",
        "content_type: 综合",
        "created: 2026-06-17",
        "tags:",
        "  - 链接笔记",
        "  - 综合",
        "---",
        "",
        "# Agent 工程文章",
        "",
        "## 概述",
        "",
        "这是一篇用于本地预览的 Markdown 文章。"
      ].join("\n")) as any
    });
    s3Mock.on(PutObjectCommand).resolves({ ETag: "\"abc123\"" });

    const result = await syncReaderIndex({
      configPath: "/tmp/missing-link-processing.config.yaml",
      now: () => new Date("2026-06-18T00:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result).toMatchObject({
        scanned: 1,
        indexed: 1,
        skipped: 0,
        indexKey: "notes/public-index.json"
      });
    }

    const put = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input;
    expect(put.Key).toBe("notes/public-index.json");
    expect(put.ContentType).toBe("application/json");
    const index = JSON.parse(String(put.Body));
    expect(index.articles[0]).toMatchObject({
      slug: "2026-06-17-Agent 工程文章",
      title: "Agent 工程文章",
      path: "notes/文章摘要/综合/2026-06-17-Agent 工程文章.md",
      contentType: "综合",
      tags: ["链接笔记", "综合"],
      author: "Author",
      sourceUrl: "https://example.dev/agent",
      summary: "文章介绍了 Agent 工程文章的本地预览和 OSS 阅读站流程。",
      excerpt: "文章介绍了 Agent 工程文章的本地预览和 OSS 阅读站流程。",
      readingTime: 1,
      sourceHost: "example.dev"
    });
  });
});
