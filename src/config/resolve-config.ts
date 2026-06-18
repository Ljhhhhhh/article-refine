import { access } from "node:fs/promises";
import { AppError, type FailureResult, toFailureResult } from "../errors/errors.js";
import { DEFAULT_CONFIG_PATH, defaultConfig, loadConfig } from "./load-config.js";
import { configSchema, type LinkProcessingConfig, type ModelProvider } from "./schema.js";

export type ProcessCliOverrides = {
  vaultPath?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  draftModel?: string;
  reviseModel?: string;
  modelProvider?: string;
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

function readOssEnv(current: LinkProcessingConfig["storage"]["oss"]): LinkProcessingConfig["storage"]["oss"] {
  const any =
    process.env.OSS_ENDPOINT ||
    process.env.OSS_REGION ||
    process.env.OSS_BUCKET ||
    process.env.OSS_ACCESS_KEY_ID ||
    process.env.OSS_SECRET_ACCESS_KEY ||
    process.env.OSS_PREFIX ||
    process.env.OSS_FORCE_PATH_STYLE ||
    process.env.OSS_MODE ||
    process.env.OSS_STRICT;

  if (!any) return current;

  return {
    ...current,
    enabled: true,
    endpoint: process.env.OSS_ENDPOINT ?? current.endpoint,
    region: process.env.OSS_REGION ?? current.region,
    bucket: process.env.OSS_BUCKET ?? current.bucket,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? current.accessKeyId,
    secretAccessKey: process.env.OSS_SECRET_ACCESS_KEY ?? current.secretAccessKey,
    prefix: process.env.OSS_PREFIX ?? current.prefix,
    forcePathStyle:
      process.env.OSS_FORCE_PATH_STYLE != null
        ? process.env.OSS_FORCE_PATH_STYLE === "true"
        : current.forcePathStyle,
    mode:
      process.env.OSS_MODE === "only" || process.env.OSS_MODE === "mirror"
        ? process.env.OSS_MODE
        : current.mode,
    strict:
      process.env.OSS_STRICT != null ? process.env.OSS_STRICT === "true" : current.strict
  };
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
      baseUrl:
        process.env.LINK_PROCESSING_LLM_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        config.llm.baseUrl,
      apiKey:
        process.env.LINK_PROCESSING_LLM_API_KEY ??
        process.env.OPENAI_API_KEY ??
        config.llm.apiKey
    },
    storage: {
      ...config.storage,
      oss: readOssEnv(config.storage.oss)
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
      modelProvider: cli.modelProvider ?? config.llm.modelProvider,
      model: cli.llmModel ?? config.llm.model,
      draftModel: cli.draftModel ?? config.llm.draftModel,
      reviseModel: cli.reviseModel ?? config.llm.reviseModel,
      baseUrl: cli.llmBaseUrl ?? config.llm.baseUrl
    }
  });
}

function inferModelProvider(config: LinkProcessingConfig): LinkProcessingConfig {
  if (config.llm.modelProvider) return config;
  let inferred: ModelProvider = "custom-openai-compatible";
  if (config.llm.baseUrl?.includes("siliconflow.cn")) inferred = "siliconflow";
  else if (config.llm.baseUrl?.includes("openrouter.ai")) inferred = "openrouter";
  return configSchema.parse({
    ...config,
    llm: { ...config.llm, modelProvider: inferred }
  });
}

export async function resolveProcessConfig(input: {
  configPath?: string;
  cli: ProcessCliOverrides;
  requireVault?: boolean;
}): Promise<ResolvedProcessConfig> {
  const configPath = input.configPath ?? DEFAULT_CONFIG_PATH;
  const loadedConfigFile = await fileExists(configPath);
  const requireVault = input.requireVault ?? true;

  try {
    const effectiveVault =
      input.cli.vaultPath ?? process.env.LINK_PROCESSING_VAULT ?? undefined;

    const base = loadedConfigFile
      ? await loadConfig(configPath)
      : defaultConfig(effectiveVault ?? "");

    const baseIsOssOnly =
      (base.storage.oss.enabled && base.storage.oss.mode === "only") ||
      (process.env.OSS_MODE === "only" && !!(process.env.OSS_ENDPOINT || process.env.OSS_BUCKET));

    if (requireVault && !baseIsOssOnly && !base.obsidian.vaultPath && !effectiveVault) {
      throw new AppError(
        "OBSIDIAN_CONFIG_MISSING",
        `Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath in ${DEFAULT_CONFIG_PATH}.`
      );
    }

    const config = inferModelProvider(applyCli(applyEnv(base), input.cli));
    const isOssOnly = config.storage.oss.enabled && config.storage.oss.mode === "only";

    if (requireVault && !isOssOnly && !config.obsidian.vaultPath) {
      throw new AppError(
        "OBSIDIAN_CONFIG_MISSING",
        `Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath in ${DEFAULT_CONFIG_PATH}.`
      );
    }

    if (config.storage.oss.enabled) {
      const missing: string[] = [];
      if (!config.storage.oss.endpoint) missing.push("OSS_ENDPOINT");
      if (!config.storage.oss.region) missing.push("OSS_REGION");
      if (!config.storage.oss.bucket) missing.push("OSS_BUCKET");
      if (!config.storage.oss.accessKeyId) missing.push("OSS_ACCESS_KEY_ID");
      if (!config.storage.oss.secretAccessKey) missing.push("OSS_SECRET_ACCESS_KEY");
      if (missing.length > 0) {
        throw new AppError(
          "OSS_CONFIG_INVALID",
          `OSS is enabled but required fields are missing: ${missing.join(", ")}.`
        );
      }
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
