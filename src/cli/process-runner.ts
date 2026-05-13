import { processLink, type DuplicatePolicy, type ProcessOptions, type ProcessResult } from "../core/process-link.js";
import { resolveProcessConfig } from "../config/resolve-config.js";
import { createExtractor } from "../llm/factory.js";
import { TwitterFetcher } from "../fetchers/twitter-fetcher.js";
import { WebFetcher } from "../fetchers/web-fetcher.js";
import { OssUploader } from "../storage/oss-uploader.js";
import { shouldUseOssOnlyMode } from "./commands/process.js";

export type ProcessCommandOptions = {
  vault?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  draftModel?: string;
  reviseModel?: string;
  config?: string;
  skipExisting?: boolean;
  updateExisting?: boolean;
  oss?: boolean;
  onProgress?: (step: string) => void;
};

export function selectDuplicatePolicy(options: Pick<ProcessCommandOptions, "skipExisting" | "updateExisting">): DuplicatePolicy {
  if (options.updateExisting) return "update";
  if (options.skipExisting) return "skip";
  return "create";
}

function invalidOptions(sourceUrl: string, message: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: { code: "INVALID_OPTIONS", message, retryable: false }
  };
}

function missingVault(sourceUrl: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: {
      code: "OBSIDIAN_CONFIG_MISSING",
      message: "Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath when OSS-only mode is disabled.",
      retryable: false
    }
  };
}

function extractorFailure(sourceUrl: string, message: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: { code: "LLM_OUTPUT_INVALID", message, retryable: false }
  };
}

export async function runProcessCommand(sourceUrl: string, options: ProcessCommandOptions): Promise<ProcessResult> {
  if (options.skipExisting && options.updateExisting) {
    return invalidOptions(sourceUrl, "Cannot use --skip-existing and --update-existing together.");
  }

  const resolved = await resolveProcessConfig({
    configPath: options.config,
    cli: {
      vaultPath: options.vault,
      llmProvider: options.llmProvider,
      llmModel: options.llmModel,
      llmBaseUrl: options.llmBaseUrl,
      draftModel: options.draftModel,
      reviseModel: options.reviseModel
    }
  });

  if (!resolved.ok) return { ...resolved, sourceUrl };

  const config = resolved.config;
  const isOssOnly = shouldUseOssOnlyMode(config.storage.oss, options.oss);
  if (!isOssOnly && !config.obsidian.vaultPath) {
    return missingVault(sourceUrl);
  }

  let extractor;
  try {
    extractor = createExtractor({ ...config.llm, onProgress: options.onProgress });
  } catch (error) {
    return extractorFailure(sourceUrl, error instanceof Error ? error.message : "Extractor creation failed.");
  }

  let oss: ProcessOptions["oss"];
  if (config.storage.oss.enabled && options.oss !== false) {
    oss = {
      uploader: new OssUploader({
        endpoint: config.storage.oss.endpoint!,
        region: config.storage.oss.region!,
        bucket: config.storage.oss.bucket!,
        prefix: config.storage.oss.prefix,
        accessKeyId: config.storage.oss.accessKeyId!,
        secretAccessKey: config.storage.oss.secretAccessKey!,
        forcePathStyle: config.storage.oss.forcePathStyle
      }),
      prefix: config.storage.oss.prefix,
      strict: config.storage.oss.strict
    };
  }

  return processLink(sourceUrl, {
    vaultPath: isOssOnly ? undefined : config.obsidian.vaultPath,
    mode: isOssOnly ? "only" : "mirror",
    fetchers: [new TwitterFetcher(), new WebFetcher()],
    extractor,
    qualityThreshold: config.processing.qualityThreshold,
    onProgress: options.onProgress,
    duplicatePolicy: selectDuplicatePolicy(options),
    oss
  });
}
