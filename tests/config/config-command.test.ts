import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeDefaultConfig, checkConfig } from "../../src/config/load-config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-config-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("config helpers", () => {
  test("writes default config with Obsidian categories", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");

    await writeDefaultConfig(configPath, "/vault");

    const content = await readFile(configPath, "utf8");
    expect(content).toContain("vaultPath: /vault");
    expect(content).toContain("technology: 技术深度");
  });

  test("checks readable config", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await checkConfig(configPath);

    expect(result.ok).toBe(true);
  });
});
