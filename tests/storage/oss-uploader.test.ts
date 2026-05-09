import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { OssUploader } from "../../src/storage/oss-uploader.js";
import { AppError } from "../../src/errors/errors.js";

const s3Mock = mockClient(S3Client);

const baseConfig = {
  endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
  region: "cn-hangzhou",
  bucket: "my-bucket",
  prefix: "",
  accessKeyId: "id",
  secretAccessKey: "secret",
  forcePathStyle: false
};

beforeEach(() => {
  s3Mock.reset();
});

afterEach(() => {
  s3Mock.reset();
});

describe("OssUploader", () => {
  test("uploads with correct bucket, key, and content-type", async () => {
    s3Mock.on(PutObjectCommand).resolves({ ETag: "\"abc123\"" });
    const uploader = new OssUploader(baseConfig);

    const result = await uploader.upload({
      key: "文章摘要/综合/a.md",
      body: "# hello"
    });

    expect(result.bucket).toBe("my-bucket");
    expect(result.key).toBe("文章摘要/综合/a.md");
    expect(result.url).toBe("oss://my-bucket/文章摘要/综合/a.md");
    expect(result.httpsUrl).toContain("my-bucket");
    expect(result.etag).toBe("\"abc123\"");

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.ContentType).toBe("text/markdown; charset=utf-8");
  });

  test("raises OSS_UPLOAD_FAILED on SDK error", async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error("network down"));
    const uploader = new OssUploader(baseConfig);

    await expect(
      uploader.upload({ key: "a.md", body: "hi" })
    ).rejects.toMatchObject({ code: "OSS_UPLOAD_FAILED" });
  });

  test("head resolves when bucket reachable", async () => {
    s3Mock.on(HeadBucketCommand).resolves({});
    const uploader = new OssUploader(baseConfig);

    await expect(uploader.head()).resolves.toBeUndefined();
  });

  test("head maps failure into AppError", async () => {
    s3Mock.on(HeadBucketCommand).rejects(new Error("403 forbidden"));
    const uploader = new OssUploader(baseConfig);

    await expect(uploader.head()).rejects.toBeInstanceOf(AppError);
  });
});
