import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeDefaultConfig } from "../../src/config/load-config.js";
import { runDoctor } from "../../src/core/doctor.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-doctor-"));
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.LINK_PROCESSING_LLM_PROVIDER;
  delete process.env.LINK_PROCESSING_LLM_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OSS_ENDPOINT;
  delete process.env.OSS_REGION;
  delete process.env.OSS_BUCKET;
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_SECRET_ACCESS_KEY;
  delete process.env.OSS_PREFIX;
  delete process.env.OSS_FORCE_PATH_STYLE;
  delete process.env.OSS_MODE;
  delete process.env.OSS_STRICT;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("runDoctor", () => {
  test("passes for mock provider and writable vault", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await runDoctor({ configPath });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.id)).toContain("config");
    expect(result.checks.map((check) => check.id)).toContain("vault");
    expect(result.checks.map((check) => check.id)).toContain("llm-provider");
  });

  test("fails when draft-revise provider lacks api key", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.LINK_PROCESSING_LLM_PROVIDER = "draft-revise";
    delete process.env.OPENAI_API_KEY;

    const result = await runDoctor({ configPath });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "llm-api-key",
        status: "fail"
      })
    );
  });
});

describe("runDoctor OSS", () => {
  test("skips OSS check when OSS is not enabled", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await runDoctor({ configPath });

    const ossCheck = result.checks.find((check) => check.id === "oss");
    expect(ossCheck?.status).toBe("warn");
    expect(ossCheck?.message).toMatch(/not configured/i);
  });

  test("fails OSS check when head bucket rejects", async () => {
    const { mockClient } = await import("aws-sdk-client-mock");
    const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
    const s3Mock = mockClient(S3Client);
    s3Mock.on(HeadBucketCommand).rejects(new Error("403 forbidden"));

    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.OSS_ENDPOINT = "https://s3.oss-cn-hangzhou.aliyuncs.com";
    process.env.OSS_REGION = "cn-hangzhou";
    process.env.OSS_BUCKET = "my-bucket";
    process.env.OSS_ACCESS_KEY_ID = "id";
    process.env.OSS_SECRET_ACCESS_KEY = "secret";

    const result = await runDoctor({ configPath });

    s3Mock.reset();
    const ossCheck = result.checks.find((check) => check.id === "oss");
    expect(ossCheck?.status).toBe("fail");
    expect(result.ok).toBe(false);
  });
});
