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
    .option("--llm-provider <provider>", "LLM provider (mock|two-step)")
    .option("--llm-model <model>", "LLM model name")
    .option("--llm-base-url <url>", "OpenAI-compatible API base URL")
    .option("--step1-model <model>", "Step 1 LLM model name")
    .option("--step2-model <model>", "Step 2 LLM model name")
    .action(async (url: string, options: { json?: boolean; vault?: string; llmProvider?: string; llmModel?: string; llmBaseUrl?: string; step1Model?: string; step2Model?: string }) => {
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
        process.stdout.write(options.json ? renderJson(failure) : "Missing Obsidian vault. Provide --vault or LINK_PROCESSING_VAULT.\n");
        process.exitCode = 5;
        return;
      }

      const provider = options.llmProvider ?? process.env.LINK_PROCESSING_LLM_PROVIDER ?? "two-step";
      const model = options.llmModel ?? process.env.LINK_PROCESSING_LLM_MODEL ?? "gpt-4o";

      let extractor;
      try {
        extractor = createExtractor({
          provider: provider as "mock" | "two-step",
          model,
          baseUrl: options.llmBaseUrl ?? process.env.OPENAI_BASE_URL,
          apiKey: process.env.OPENAI_API_KEY,
          step1Model: options.step1Model,
          step2Model: options.step2Model
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
        qualityThreshold: 300
      });

      process.stdout.write(
        options.json ? renderJson(result) : renderHumanProcessResult(result)
      );
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
