import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { configSchema, type LinkProcessingConfig } from "./schema.js";

export function defaultConfig(vaultPath: string): LinkProcessingConfig {
  return {
    obsidian: {
      vaultPath,
      categories: {
        technology: "技术深度",
        opinion: "观点思考",
        news: "资讯动态",
        tutorial: "教程学习",
        general: "综合"
      }
    },
    processing: {
      qualityThreshold: 300,
      defaultFormat: "standard",
      timeoutSeconds: 120,
      retryCount: 3
    },
    llm: {
      provider: "mock",
      model: "mock"
    },
    logging: {
      level: "info"
    }
  };
}

export async function writeDefaultConfig(configPath: string, vaultPath: string): Promise<void> {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, YAML.stringify(defaultConfig(vaultPath)), "utf8");
}

export async function loadConfig(configPath: string): Promise<LinkProcessingConfig> {
  const raw = await readFile(configPath, "utf8");
  return configSchema.parse(YAML.parse(raw));
}

export async function checkConfig(configPath: string): Promise<{ ok: true; config: LinkProcessingConfig } | { ok: false; message: string }> {
  try {
    const config = await loadConfig(configPath);
    await mkdir(path.join(config.obsidian.vaultPath, "文章摘要"), { recursive: true });
    return { ok: true, config };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Config check failed."
    };
  }
}
