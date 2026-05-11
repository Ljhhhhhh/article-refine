import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAgent } from "../src/index.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-agent-settings-"));
  process.env = { ...savedEnv };
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.LINK_PROCESSING_LLM_API_KEY;
  delete process.env.LINK_PROCESSING_LLM_BASE_URL;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("Agent.getSettings", () => {
  test("returns sanitized settings with apiKeyConfigured true", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmModel: "test-model", llmBaseUrl: "http://localhost:11435/v1" }
    });

    // Use mock provider which doesn't need a real API key
    const settings = agent.getSettings();
    expect(settings.llm.provider).toBe("mock");
    expect(settings.llm.model).toBe("test-model");
    expect(settings.persistence).toBeDefined();
    expect(settings.persistence?.configPath).toBeDefined();
  });

  test("returns persistence info", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const config = {
      obsidian: {
        vaultPath: tempDir,
        categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" }
      },
      llm: { provider: "mock", model: "mock", longContentThreshold: 32000 },
      processing: { qualityThreshold: 300, defaultFormat: "standard", timeoutSeconds: 120, retryCount: 3 },
      logging: { level: "info" }
    };
    await writeFile(configPath, YAML.stringify(config), "utf8");

    const agent = await createAgent({ configPath });
    const settings = agent.getSettings();

    expect(settings.persistence?.loadedConfigFile).toBe(true);
    expect(settings.persistence?.canPersist).toBe(true);
  });
});

describe("Agent.updateSettings", () => {
  test("updates model setting and returns ok", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ model: "new-model" });

    expect(result.ok).toBe(true);
    expect(result.settings.llm.model).toBe("new-model");
    expect(agent.config.llm.model).toBe("new-model");
  });

  test("dry run does not change runtime config", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmModel: "original", llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ model: "changed" }, true);

    expect(result.ok).toBe(true);
    expect(result.settings.llm.model).toBe("changed");
    expect(result.persistence.persisted).toBe(false);
    expect(agent.config.llm.model).toBe("original");
  });

  test("rejects invalid config", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ longContentThreshold: -1 });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_OPTIONS");
  });

  test("clearApiKey clears the API key", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ clearApiKey: true });

    expect(result.ok).toBe(true);
    expect(result.settings.llm.apiKeyConfigured).toBe(false);
    expect(agent.config.llm.apiKey).toBeUndefined();
  });

  test("empty apiKey string preserves existing key", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ apiKey: "" });

    expect(result.ok).toBe(true);
    // apiKey should remain unchanged (not cleared, not replaced)
    expect(result.settings.llm.apiKeyConfigured).toBe(false); // mock provider has no key
  });

  test("non-empty apiKey replaces existing key", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmBaseUrl: "http://localhost:11435/v1" }
    });

    const result = await agent.updateSettings({ apiKey: "sk-new-key" });

    expect(result.ok).toBe(true);
    expect(agent.config.llm.apiKey).toBe("sk-new-key");
  });

  test("writes to config file when loadedConfigFile is true", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const config = {
      obsidian: {
        vaultPath: tempDir,
        categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" }
      },
      llm: { provider: "mock", model: "mock", longContentThreshold: 32000 },
      processing: { qualityThreshold: 300, defaultFormat: "standard", timeoutSeconds: 120, retryCount: 3 },
      logging: { level: "info" }
    };
    await writeFile(configPath, YAML.stringify(config), "utf8");

    const agent = await createAgent({ configPath });
    const result = await agent.updateSettings({ model: "updated-model" });

    expect(result.ok).toBe(true);
    expect(result.persistence.persisted).toBe(true);

    const raw = await readFile(configPath, "utf8");
    const saved = YAML.parse(raw);
    expect(saved.llm.model).toBe("updated-model");
  });

  test("config getter reflects updated state", async () => {
    const agent = await createAgent({
      configPath: path.join(tempDir, "config.yaml"),
      overrides: { vaultPath: tempDir, llmModel: "before", llmBaseUrl: "http://localhost:11435/v1" }
    });

    expect(agent.config.llm.model).toBe("before");
    await agent.updateSettings({ model: "after" });
    expect(agent.config.llm.model).toBe("after");
  });
});
