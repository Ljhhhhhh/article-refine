import type { Command } from "commander";
import { processLink } from "../../core/process-link.js";
import { WebFetcher } from "../../fetchers/web-fetcher.js";
import { TwitterFetcher } from "../../fetchers/twitter-fetcher.js";
import { createExtractor } from "../../llm/factory.js";
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
        }
      ) => {
        const vaultPath = options.vault ?? process.env.LINK_PROCESSING_VAULT;
        if (!vaultPath) {
          const failure = {
            ok: false,
            command: "process",
            sourceUrl: url,
            error: {
              code: "OBSIDIAN_CONFIG_MISSING",
              message: "Provide --vault or LINK_PROCESSING_VAULT.",
              retryable: false
            }
          };
          process.stdout.write(
            options.json
              ? renderJson(failure)
              : "Missing Obsidian vault. Provide --vault or LINK_PROCESSING_VAULT.\n"
          );
          process.exitCode = 5;
          return;
        }

        const provider =
          options.llmProvider ??
          process.env.LINK_PROCESSING_LLM_PROVIDER ??
          "draft-revise";
        const model = options.llmModel ?? process.env.LINK_PROCESSING_LLM_MODEL ?? "gpt-4o";

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
            provider: provider as "mock" | "draft-revise" | "two-step",
            model,
            baseUrl: options.llmBaseUrl ?? process.env.OPENAI_BASE_URL,
            apiKey: process.env.OPENAI_API_KEY,
            draftModel: options.draftModel,
            reviseModel: options.reviseModel,
            longContentThreshold: 32000,
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

        const result = await processLink(url, {
          vaultPath,
          fetchers: [new TwitterFetcher(), new WebFetcher()],
          extractor,
          qualityThreshold: 300,
          onProgress
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
