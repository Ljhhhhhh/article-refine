import type { Command } from "commander";
import { processLink } from "../../core/process-link.js";
import { WebFetcher } from "../../fetchers/web-fetcher.js";
import { TwitterFetcher } from "../../fetchers/twitter-fetcher.js";
import { createExtractor } from "../../llm/factory.js";
import { resolveProcessConfig } from "../../config/resolve-config.js";
import { renderHumanProcessResult } from "../presenters/human.js";
import { renderJson } from "../presenters/json.js";

export function registerProcessCommand(program: Command): void {
  program
    .command("process")
    .argument("<url>")
    .option("--json", "print machine-readable JSON")
    .option("--vault <path>", "Obsidian vault path")
    .option("--llm-provider <provider>", "LLM provider (mock|draft-revise)")
    .option("--llm-model <model>", "LLM model name (fallback for both passes)")
    .option("--llm-base-url <url>", "OpenAI-compatible API base URL")
    .option("--draft-model <model>", "Draft (Pass 1) LLM model name")
    .option("--revise-model <model>", "Revise (Pass 2, thinking) LLM model name")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--skip-existing", "skip processing if source URL already exists in the vault index")
    .option("--update-existing", "overwrite the existing note if source URL already exists")
    .action(
      async (
        url: string,
        options: {
          json?: boolean;
          vault?: string;
          llmProvider?: string;
          llmModel?: string;
          llmBaseUrl?: string;
          draftModel?: string;
          reviseModel?: string;
          config?: string;
          skipExisting?: boolean;
          updateExisting?: boolean;
        }
      ) => {
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

        if (!resolved.ok) {
          process.stdout.write(
            options.json
              ? renderJson(resolved)
              : `Missing configuration\n\nError: ${resolved.error.code}\nMessage: ${resolved.error.message}\n`
          );
          process.exitCode = 5;
          return;
        }

        const config = resolved.config;

        const onProgress = options.json
          ? undefined
          : (step: string) => {
              const labels: Record<string, string> = {
                fetching: "正在抓取内容...",
                preparing: "准备阶段：长文压缩（如需要）...",
                drafting: "Pass 1: 起草笔记...",
                revising: "Pass 2: 对照原文修订...",
                saving: "保存到 Obsidian..."
              };
              process.stderr.write(`  ${labels[step] ?? step}\n`);
            };

        let extractor;
        try {
          extractor = createExtractor({
            ...config.llm,
            onProgress
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Extractor creation failed.";
          const failure = {
            ok: false,
            command: "process",
            sourceUrl: url,
            error: {
              code: "LLM_OUTPUT_INVALID",
              message,
              retryable: false
            }
          };
          process.stdout.write(options.json ? renderJson(failure) : `Error: ${message}\n`);
          process.exitCode = 4;
          return;
        }

        const duplicatePolicy = options.updateExisting
          ? "update"
          : options.skipExisting
            ? "skip"
            : "create";

        const result = await processLink(url, {
          vaultPath: config.obsidian.vaultPath,
          fetchers: [new TwitterFetcher(), new WebFetcher()],
          extractor,
          qualityThreshold: config.processing.qualityThreshold,
          onProgress,
          duplicatePolicy
        });

        process.stdout.write(
          options.json ? renderJson(result) : renderHumanProcessResult(result)
        );
        if (!result.ok) {
          process.exitCode = 1;
        }
      }
    );
}
