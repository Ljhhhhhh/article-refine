import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeDefaultConfig } from "../../src/config/load-config.js";
import { resolveProcessConfig } from "../../src/config/resolve-config.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-resolve-config-"));
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.LINK_PROCESSING_LLM_PROVIDER;
  delete process.env.LINK_PROCESSING_LLM_MODEL;
  delete process.env.LINK_PROCESSING_DRAFT_MODEL;
  delete process.env.LINK_PROCESSING_REVISE_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_KEY;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("resolveProcessConfig", () => {
  test("uses config file values when CLI and env do not override them", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    const vaultPath = path.join(tempDir, "vault-from-config");
    await writeDefaultConfig(configPath, vaultPath);

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.obsidian.vaultPath).toBe(vaultPath);
      expect(resolved.config.llm.provider).toBe("mock");
      expect(resolved.configPath).toBe(configPath);
    }
  });

  test("applies precedence CLI over env over config file", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, path.join(tempDir, "vault-from-config"));
    process.env.LINK_PROCESSING_VAULT = path.join(tempDir, "vault-from-env");
    process.env.LINK_PROCESSING_LLM_PROVIDER = "mock";

    const resolved = await resolveProcessConfig({
      configPath,
      cli: {
        vaultPath: path.join(tempDir, "vault-from-cli"),
        llmProvider: "draft-revise",
        llmModel: "model-from-cli",
        llmBaseUrl: "http://127.0.0.1:11435/v1"
      }
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.obsidian.vaultPath).toBe(path.join(tempDir, "vault-from-cli"));
      expect(resolved.config.llm.provider).toBe("draft-revise");
      expect(resolved.config.llm.model).toBe("model-from-cli");
      expect(resolved.config.llm.baseUrl).toBe("http://127.0.0.1:11435/v1");
    }
  });

  test("returns a config missing error when no vault exists anywhere", async () => {
    const configPath = path.join(tempDir, "missing.config.yaml");

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
      expect(resolved.error.message).toContain("--vault");
      expect(resolved.error.message).toContain("LINK_PROCESSING_VAULT");
      expect(resolved.error.message).toContain("link-processing.config.yaml");
    }
  });

  test("does not create or modify the config file while resolving", async () => {
    const configPath = path.join(tempDir, "missing.config.yaml");
    await resolveProcessConfig({ configPath, cli: { vaultPath: path.join(tempDir, "vault") } });

    await expect(readFile(configPath, "utf8")).rejects.toThrow();
  });
});
