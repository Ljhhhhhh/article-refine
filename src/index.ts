import { resolveProcessConfig, type ProcessCliOverrides } from "./config/resolve-config.js";
import { createExtractor } from "./llm/factory.js";
import { writeConfig } from "./config/load-config.js";
import { configSchema, type LinkProcessingConfig } from "./config/schema.js";
import { WebFetcher } from "./fetchers/web-fetcher.js";
import { TwitterFetcher } from "./fetchers/twitter-fetcher.js";
import { OssUploader } from "./storage/oss-uploader.js";
import {
  processLink,
  type DuplicatePolicy,
  type ProcessOptions,
  type ProcessResult
} from "./core/process-link.js";
import { routeLink, type RouteResult } from "./core/route-link.js";
import { inspectLink, type InspectResult } from "./core/inspect-link.js";
import { runDoctor, type DoctorResult } from "./core/doctor.js";
import { AppError } from "./errors/errors.js";
import type { ContentFetcher } from "./fetchers/fetcher.js";
import type { NoteExtractor } from "./llm/note-extractor.js";

export type {
  ProcessResult,
  RouteResult,
  InspectResult,
  DoctorResult,
  DuplicatePolicy,
  LinkProcessingConfig
};
export { processLink, routeLink, inspectLink, runDoctor };

export type AgentSettings = {
  llm: {
    provider: string;
    modelProvider?: string;
    model: string;
    draftModel?: string;
    reviseModel?: string;
    baseUrl?: string;
    apiKeyConfigured: boolean;
    longContentThreshold: number;
  };
  persistence?: {
    loadedConfigFile: boolean;
    configPath: string;
    canPersist: boolean;
  };
};

export type LlmSettingsPatch = {
  provider?: "mock" | "draft-revise" | "two-step" | "openai";
  modelProvider?: "siliconflow" | "openrouter" | "custom-openai-compatible";
  model?: string;
  draftModel?: string;
  reviseModel?: string;
  baseUrl?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  longContentThreshold?: number;
};

export type AgentSettingsUpdateResult = {
  ok: boolean;
  settings: AgentSettings;
  persistence: {
    persisted: boolean;
    configPath: string;
    loadedConfigFile: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
};

export type CreateAgentInput = {
  configPath?: string;
  overrides?: ProcessCliOverrides;
  /** Override default fetchers. Default: [TwitterFetcher, WebFetcher]. */
  fetchers?: ContentFetcher[];
  /** Pre-built extractor. Default: createExtractor(config.llm). */
  extractor?: NoteExtractor;
};

export type ProcessInput = {
  duplicatePolicy?: DuplicatePolicy;
  /** Force-disable OSS mirror for this single call even when configured. */
  oss?: boolean;
  onProgress?: (step: string) => void;
};

export type Agent = {
  readonly config: LinkProcessingConfig;
  readonly configPath: string;
  process(url: string, input?: ProcessInput): Promise<ProcessResult>;
  route(url: string): RouteResult;
  inspect(url: string): Promise<InspectResult>;
  doctor(): Promise<DoctorResult>;
  close(): Promise<void>;
  getSettings(): AgentSettings;
  updateSettings(patch: LlmSettingsPatch, dryRun?: boolean): Promise<AgentSettingsUpdateResult>;
};

function sanitizeSettings(config: LinkProcessingConfig): AgentSettings {
  return {
    llm: {
      provider: config.llm.provider,
      modelProvider: config.llm.modelProvider,
      model: config.llm.model,
      draftModel: config.llm.draftModel,
      reviseModel: config.llm.reviseModel,
      baseUrl: config.llm.baseUrl,
      apiKeyConfigured: !!config.llm.apiKey,
      longContentThreshold: config.llm.longContentThreshold
    }
  };
}

export async function createAgent(input: CreateAgentInput = {}): Promise<Agent> {
  const resolved = await resolveProcessConfig({
    configPath: input.configPath,
    cli: input.overrides ?? {}
  });
  if (!resolved.ok) {
    throw new AppError(resolved.error.code, resolved.error.message);
  }

  const configPath = resolved.configPath;
  const loadedConfigFile = resolved.loadedConfigFile;

  let runtimeConfig = resolved.config;
  const fetchers = input.fetchers ?? [new TwitterFetcher(), new WebFetcher()];
  let extractor = input.extractor ?? createExtractor({ ...runtimeConfig.llm });

  const uploader = runtimeConfig.storage.oss.enabled
    ? new OssUploader({
        endpoint: runtimeConfig.storage.oss.endpoint!,
        region: runtimeConfig.storage.oss.region!,
        bucket: runtimeConfig.storage.oss.bucket!,
        prefix: runtimeConfig.storage.oss.prefix,
        accessKeyId: runtimeConfig.storage.oss.accessKeyId!,
        secretAccessKey: runtimeConfig.storage.oss.secretAccessKey!,
        forcePathStyle: runtimeConfig.storage.oss.forcePathStyle
      })
    : undefined;

  function currentSettings(): AgentSettings {
    return {
      ...sanitizeSettings(runtimeConfig),
      persistence: {
        loadedConfigFile,
        configPath,
        canPersist: loadedConfigFile
      }
    };
  }

  return {
    get config() {
      return runtimeConfig;
    },
    configPath,

    getSettings() {
      return currentSettings();
    },

    async updateSettings(patch: LlmSettingsPatch, dryRun = false): Promise<AgentSettingsUpdateResult> {
      const merged: LinkProcessingConfig["llm"] = { ...runtimeConfig.llm };

      if (patch.provider !== undefined) {
        merged.provider = patch.provider as LinkProcessingConfig["llm"]["provider"];
      }
      if (patch.modelProvider !== undefined) merged.modelProvider = patch.modelProvider;
      if (patch.model !== undefined) merged.model = patch.model;
      if (patch.draftModel !== undefined) merged.draftModel = patch.draftModel;
      if (patch.reviseModel !== undefined) merged.reviseModel = patch.reviseModel;
      if (patch.baseUrl !== undefined) merged.baseUrl = patch.baseUrl;
      if (patch.longContentThreshold !== undefined) merged.longContentThreshold = patch.longContentThreshold;

      if (patch.clearApiKey) {
        merged.apiKey = undefined;
      } else if (patch.apiKey && patch.apiKey.trim() !== "") {
        merged.apiKey = patch.apiKey;
      }

      let newConfig: LinkProcessingConfig;
      try {
        newConfig = configSchema.parse({
          ...runtimeConfig,
          llm: merged
        });
      } catch (err) {
        return {
          ok: false,
          settings: currentSettings(),
          persistence: { persisted: false, configPath, loadedConfigFile },
          error: {
            code: "INVALID_OPTIONS",
            message: err instanceof Error ? err.message : "Validation failed"
          }
        };
      }

      try {
        createExtractor({ ...newConfig.llm });
      } catch (err) {
        return {
          ok: false,
          settings: currentSettings(),
          persistence: { persisted: false, configPath, loadedConfigFile },
          error: {
            code: "INVALID_OPTIONS",
            message: err instanceof Error ? err.message : "Extractor creation failed"
          }
        };
      }

      if (dryRun) {
        return {
          ok: true,
          settings: sanitizeSettings(newConfig),
          persistence: { persisted: false, configPath, loadedConfigFile }
        };
      }

      let persisted = false;
      if (loadedConfigFile) {
        const llmPatchForFile: Record<string, unknown> = { ...newConfig.llm };
        if (!patch.apiKey && !patch.clearApiKey) {
          delete llmPatchForFile.apiKey;
        }
        await writeConfig(configPath, llmPatchForFile as Partial<LinkProcessingConfig["llm"]>);
        persisted = true;
      }

      runtimeConfig = newConfig;
      extractor = createExtractor({ ...newConfig.llm });

      return {
        ok: true,
        settings: sanitizeSettings(newConfig),
        persistence: { persisted, configPath, loadedConfigFile }
      };
    },

    route(url) {
      return routeLink(url);
    },

    async inspect(url) {
      return inspectLink(url, {
        fetchers,
        qualityThreshold: runtimeConfig.processing.qualityThreshold
      });
    },

    async process(url, runtime = {}) {
      const oss: ProcessOptions["oss"] =
        uploader && runtime.oss !== false
          ? {
              uploader,
              prefix: runtimeConfig.storage.oss.prefix,
              strict: runtimeConfig.storage.oss.strict
            }
          : undefined;

      const isOssOnly = runtimeConfig.storage.oss.enabled && runtimeConfig.storage.oss.mode === "only";

      return processLink(url, {
        vaultPath: isOssOnly ? undefined : runtimeConfig.obsidian.vaultPath,
        mode: isOssOnly ? "only" : "mirror",
        fetchers,
        extractor,
        qualityThreshold: runtimeConfig.processing.qualityThreshold,
        duplicatePolicy: runtime.duplicatePolicy,
        onProgress: runtime.onProgress,
        oss
      });
    },

    async doctor() {
      return runDoctor({ configPath });
    },

    async close() {
      // Reserved for future resource cleanup (S3 clients, keep-alive agents, etc.).
    }
  };
}
