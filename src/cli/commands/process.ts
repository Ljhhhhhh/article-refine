import type { Command } from "commander";
import { processLink } from "../../core/process-link.js";
import { WebFetcher } from "../../fetchers/web-fetcher.js";
import { TwitterFetcher } from "../../fetchers/twitter-fetcher.js";
import { MockNoteExtractor } from "../../llm/note-extractor.js";
import { renderHumanProcessResult } from "../presenters/human.js";
import { renderJson } from "../presenters/json.js";

export function registerProcessCommand(program: Command): void {
  program
    .command("process")
    .argument("<url>")
    .option("--json", "print machine-readable JSON")
    .option("--vault <path>", "Obsidian vault path")
    .action(async (url: string, options: { json?: boolean; vault?: string }) => {
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

      const result = await processLink(url, {
        vaultPath,
        fetchers: [new TwitterFetcher(), new WebFetcher()],
        extractor: new MockNoteExtractor(),
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
