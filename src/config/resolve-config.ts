import { access } from "node:fs/promises";
import { AppError, type FailureResult, toFailureResult } from "../errors/errors.js";
import { DEFAULT_CONFIG_PATH, defaultConfig, loadConfig } from "./load-config.js";
import { configSchema, type LinkProcessingConfig } from "./schema.js";

export type ProcessCliOverrides = {
  vaultPath?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  draftModel?: string;
  reviseModel?: string;
};

export type ResolvedProcessConfig =
  | {
      ok: true;
      config: LinkProcessingConfig;
      configPath: string;
      loadedConfigFile: boolean;
    }
  | FailureResult;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function applyEnv(config: LinkProcessingConfig): LinkProcessingConfig {
  return configSchema.parse({
    ...config,
    obsidian: {
      ...config.obsidian,
      vaultPath: process.env.LINK_PROCESSING_VAULT ?? config.obsidian.vaultPath
    },
    llm: {
      ...config.llm,
      provider: process.env.LINK_PROCESSING_LLM_PROVIDER ?? config.llm.provider,
      model: process.env.LINK_PROCESSING_LLM_MODEL ?? config.llm.model,
      draftModel: process.env.LINK_PROCESSING_DRAFT_MODEL ?? config.llm.draftModel,
      reviseModel: process.env.LINK_PROCESSING_REVISE_MODEL ?? config.llm.reviseModel,
      baseUrl: process.env.OPENAI_BASE_URL ?? config.llm.baseUrl,
      apiKey: process.env.OPENAI_API_KEY ?? config.llm.apiKey
    }
  });
}

function applyCli(config: LinkProcessingConfig, cli: ProcessCliOverrides): LinkProcessingConfig {
  return configSchema.parse({
    ...config,
    obsidian: {
      ...config.obsidian,
      vaultPath: cli.vaultPath ?? config.obsidian.vaultPath
    },
    llm: {
      ...config.llm,
      provider: cli.llmProvider ?? config.llm.provider,
      model: cli.llmModel ?? config.llm.model,
      draftModel: cli.draftModel ?? config.llm.draftModel,
      reviseModel: cli.reviseModel ?? config.llm.reviseModel,
      baseUrl: cli.llmBaseUrl ?? config.llm.baseUrl
    }
  });
}

export async function resolveProcessConfig(input: {
  configPath?: string;
  cli: ProcessCliOverrides;
}): Promise<ResolvedProcessConfig> {
  const configPath = input.configPath ?? DEFAULT_CONFIG_PATH;
  const loadedConfigFile = await fileExists(configPath);

  try {
    const effectiveVault =
      input.cli.vaultPath ?? process.env.LINK_PROCESSING_VAULT ?? undefined;

    const base = loadedConfigFile
      ? await loadConfig(configPath)
      : defaultConfig(effectiveVault ?? "");

    if (!base.obsidian.vaultPath && !effectiveVault) {
      throw new AppError(
        "OBSIDIAN_CONFIG_MISSING",
        `Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath in ${DEFAULT_CONFIG_PATH}.`
      );
    }

    const config = applyCli(applyEnv(base), input.cli);
    if (!config.obsidian.vaultPath) {
      throw new AppError(
        "OBSIDIAN_CONFIG_MISSING",
        `Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath in ${DEFAULT_CONFIG_PATH}.`
      );
    }

    return {
      ok: true,
      config,
      configPath,
      loadedConfigFile
    };
  } catch (error) {
    return toFailureResult(
      "process",
      error instanceof AppError
        ? error
        : new AppError(
            "OBSIDIAN_CONFIG_MISSING",
            error instanceof Error ? error.message : "Failed to resolve process config."
          )
    );
  }
}
