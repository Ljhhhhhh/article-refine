import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeConfig } from "../../src/config/load-config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-write-config-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function readYaml(configPath: string) {
  const raw = await readFile(configPath, "utf8");
  return YAML.parse(raw);
}

describe("writeConfig", () => {
  test("merges llm fields while preserving other sections", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const original = {
      obsidian: { vaultPath: "/vault", categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" } },
      llm: { provider: "mock", model: "mock", longContentThreshold: 32000 },
      processing: { qualityThreshold: 300 },
      logging: { level: "info" }
    };
    await writeFile(configPath, YAML.stringify(original), "utf8");

    await writeConfig(configPath, {
      modelProvider: "siliconflow",
      model: "Qwen/Qwen3-32B",
      baseUrl: "https://api.siliconflow.cn/v1"
    });

    const result = await readYaml(configPath);
    expect(result.obsidian.vaultPath).toBe("/vault");
    expect(result.processing.qualityThreshold).toBe(300);
    expect(result.logging.level).toBe("info");
    expect(result.llm.modelProvider).toBe("siliconflow");
    expect(result.llm.model).toBe("Qwen/Qwen3-32B");
    expect(result.llm.baseUrl).toBe("https://api.siliconflow.cn/v1");
    expect(result.llm.provider).toBe("mock");
    expect(result.llm.longContentThreshold).toBe(32000);
  });

  test("writes apiKey when provided", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const original = {
      obsidian: { vaultPath: "/vault", categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" } },
      llm: { provider: "mock", model: "mock", longContentThreshold: 32000 }
    };
    await writeFile(configPath, YAML.stringify(original), "utf8");

    await writeConfig(configPath, { apiKey: "sk-secret-key" });

    const result = await readYaml(configPath);
    expect(result.llm.apiKey).toBe("sk-secret-key");
  });

  test("removes undefined fields from llm section", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const original = {
      obsidian: { vaultPath: "/vault", categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" } },
      llm: { provider: "mock", model: "mock", draftModel: "old-model", longContentThreshold: 32000 }
    };
    await writeFile(configPath, YAML.stringify(original), "utf8");

    await writeConfig(configPath, { draftModel: undefined });

    const result = await readYaml(configPath);
    expect(result.llm.draftModel).toBeUndefined();
  });

  test("creates llm section if missing", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const original = {
      obsidian: { vaultPath: "/vault", categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" } }
    };
    await writeFile(configPath, YAML.stringify(original), "utf8");

    await writeConfig(configPath, { model: "gpt-4", provider: "draft-revise" });

    const result = await readYaml(configPath);
    expect(result.llm.model).toBe("gpt-4");
    expect(result.llm.provider).toBe("draft-revise");
    expect(result.obsidian.vaultPath).toBe("/vault");
  });

  test("preserves non-schema fields in the config file", async () => {
    const configPath = path.join(tempDir, "config.yaml");
    const original = {
      obsidian: { vaultPath: "/vault", categories: { technology: "技术深度", opinion: "观点思考", news: "资讯动态", tutorial: "教程学习", general: "综合" } },
      llm: { provider: "mock", model: "mock", longContentThreshold: 32000 },
      custom: { mySetting: "preserved" }
    };
    await writeFile(configPath, YAML.stringify(original), "utf8");

    await writeConfig(configPath, { model: "new-model" });

    const result = await readYaml(configPath);
    expect(result.custom.mySetting).toBe("preserved");
    expect(result.llm.model).toBe("new-model");
  });
});
