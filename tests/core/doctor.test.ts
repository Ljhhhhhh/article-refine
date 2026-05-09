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
