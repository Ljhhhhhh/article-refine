import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAgent } from "../src/index.js";
import { writeDefaultConfig } from "../src/config/load-config.js";

let tempDir: string;
let configPath: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-lib-"));
  configPath = path.join(tempDir, "link-processing.config.yaml");
  await writeDefaultConfig(configPath, tempDir);
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.LINK_PROCESSING_LLM_PROVIDER;
  delete process.env.LINK_PROCESSING_LLM_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OSS_ENDPOINT;
  delete process.env.OSS_REGION;
  delete process.env.OSS_BUCKET;
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_SECRET_ACCESS_KEY;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("createAgent", () => {
  test("exposes route, inspect, doctor with mock provider", async () => {
    const agent = await createAgent({
      configPath,
      overrides: { llmProvider: "mock", vaultPath: tempDir }
    });
    try {
      expect(agent.config.obsidian.vaultPath).toBe(tempDir);

      const routed = agent.route("https://twitter.com/user/status/1");
      expect(routed.ok).toBe(true);

      const doctor = await agent.doctor();
      expect(doctor.checks.length).toBeGreaterThan(0);
      expect(doctor.checks.some((c) => c.id === "vault")).toBe(true);
    } finally {
      await agent.close();
    }
  });

  test("throws AppError when no vault can be resolved", async () => {
    const missingConfig = path.join(tempDir, "nope.yaml");
    await expect(
      createAgent({ configPath: missingConfig, overrides: {} })
    ).rejects.toMatchObject({ code: "OBSIDIAN_CONFIG_MISSING" });
  });
});
