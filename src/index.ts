import { resolveProcessConfig, type ProcessCliOverrides } from "./config/resolve-config.js";
import { createExtractor } from "./llm/factory.js";
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
import type { LinkProcessingConfig } from "./config/schema.js";

export type {
  ProcessResult,
  RouteResult,
  InspectResult,
  DoctorResult,
  DuplicatePolicy,
  LinkProcessingConfig
};
export { processLink, routeLink, inspectLink, runDoctor };

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
};

export async function createAgent(input: CreateAgentInput = {}): Promise<Agent> {
  const resolved = await resolveProcessConfig({
    configPath: input.configPath,
    cli: input.overrides ?? {}
  });
  if (!resolved.ok) {
    throw new AppError(resolved.error.code, resolved.error.message);
  }

  const config = resolved.config;
  const fetchers = input.fetchers ?? [new TwitterFetcher(), new WebFetcher()];
  const extractor = input.extractor ?? createExtractor({ ...config.llm });

  const uploader = config.storage.oss.enabled
    ? new OssUploader({
        endpoint: config.storage.oss.endpoint!,
        region: config.storage.oss.region!,
        bucket: config.storage.oss.bucket!,
        prefix: config.storage.oss.prefix,
        accessKeyId: config.storage.oss.accessKeyId!,
        secretAccessKey: config.storage.oss.secretAccessKey!,
        forcePathStyle: config.storage.oss.forcePathStyle
      })
    : undefined;

  return {
    config,
    configPath: resolved.configPath,

    route(url) {
      return routeLink(url);
    },

    async inspect(url) {
      return inspectLink(url, {
        fetchers,
        qualityThreshold: config.processing.qualityThreshold
      });
    },

    async process(url, runtime = {}) {
      const oss: ProcessOptions["oss"] =
        uploader && runtime.oss !== false
          ? {
              uploader,
              prefix: config.storage.oss.prefix,
              strict: config.storage.oss.strict
            }
          : undefined;

      return processLink(url, {
        vaultPath: config.obsidian.vaultPath,
        fetchers,
        extractor,
        qualityThreshold: config.processing.qualityThreshold,
        duplicatePolicy: runtime.duplicatePolicy,
        onProgress: runtime.onProgress,
        oss
      });
    },

    async doctor() {
      return runDoctor({ configPath: resolved.configPath });
    },

    async close() {
      // Reserved for future resource cleanup (S3 clients, keep-alive agents, etc.).
    }
  };
}
