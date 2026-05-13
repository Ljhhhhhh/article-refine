import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runProcessCommand, selectDuplicatePolicy } from "../../src/cli/process-runner.js";

vi.mock("../../src/fetchers/proxy-fetch.js", () => ({
  proxyFetch: vi.fn().mockResolvedValue(
    new Response(
      `<html><head><title>Test Page</title></head><body><article><p>${"This is a comprehensive test page with substantial content that should easily exceed the quality threshold of 300 characters. ".repeat(5)}</p></article></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } }
    )
  )
}));

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  process.env = { ...savedEnv };
  for (const key of [
    "LINK_PROCESSING_VAULT",
    "LINK_PROCESSING_LLM_PROVIDER",
    "LINK_PROCESSING_LLM_MODEL",
    "LINK_PROCESSING_DRAFT_MODEL",
    "LINK_PROCESSING_REVISE_MODEL",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "OSS_ENDPOINT",
    "OSS_REGION",
    "OSS_BUCKET",
    "OSS_ACCESS_KEY_ID",
    "OSS_SECRET_ACCESS_KEY",
    "OSS_PREFIX",
    "OSS_FORCE_PATH_STYLE",
    "OSS_MODE",
    "OSS_STRICT"
  ]) {
    delete process.env[key];
  }
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-runner-"));
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("selectDuplicatePolicy", () => {
  test("defaults to create", () => {
    expect(selectDuplicatePolicy({})).toBe("create");
  });

  test("maps skip and update flags", () => {
    expect(selectDuplicatePolicy({ skipExisting: true })).toBe("skip");
    expect(selectDuplicatePolicy({ updateExisting: true })).toBe("update");
  });

  test("rejects mutually exclusive duplicate flags", async () => {
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      vault: tempDir,
      llmProvider: "mock",
      skipExisting: true,
      updateExisting: true
    });

    expect(result).toEqual({
      ok: false,
      command: "process",
      sourceUrl: "https://example.dev/agent",
      error: {
        code: "INVALID_OPTIONS",
        message: "Cannot use --skip-existing and --update-existing together.",
        retryable: false
      }
    });
  });
});

describe("runProcessCommand", () => {
  test("returns a stable config error when local vault is required but missing", async () => {
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      oss: false,
      llmProvider: "mock"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
    }
  });

  test("honors --no-oss even when env requests OSS-only mode", async () => {
    process.env.OSS_ENDPOINT = "https://s3.example.com";
    process.env.OSS_REGION = "test-region";
    process.env.OSS_BUCKET = "test-bucket";
    process.env.OSS_ACCESS_KEY_ID = "test-access-key";
    process.env.OSS_SECRET_ACCESS_KEY = "test-secret";
    process.env.OSS_MODE = "only";

    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      oss: false,
      llmProvider: "mock"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
    }
  });

  test("forwards progress events from processLink", async () => {
    const steps: string[] = [];
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      vault: tempDir,
      llmProvider: "mock",
      onProgress: (step) => steps.push(step)
    });

    if (!result.ok) {
      console.error("Unexpected failure:", JSON.stringify(result.error));
    }
    expect(result.ok).toBe(true);
    expect(steps).toEqual(expect.arrayContaining(["fetching", "extracting", "saving"]));
  });
});
