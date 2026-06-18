import type { Command } from "commander";
import { syncReaderIndex, type SyncReaderIndexResult } from "../../core/sync-reader-index.js";
import { renderJson } from "../presenters/json.js";

function renderHumanSyncReaderIndex(result: SyncReaderIndexResult): string {
  if (!result.ok) {
    return `Reader index sync failed\n\n${result.error.code}: ${result.error.message}\n`;
  }

  return [
    "Reader index synced",
    "",
    `Index: ${result.indexKey}`,
    `Scanned: ${result.scanned}`,
    `Indexed: ${result.indexed}`,
    `Skipped: ${result.skipped}`,
    ""
  ].join("\n");
}

export function registerReaderCommand(program: Command): void {
  const reader = program.command("reader").description("Manage the OSS reader index");

  reader
    .command("sync-index")
    .description("rebuild public-index.json from existing OSS Markdown articles")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--json", "print machine-readable JSON")
    .action(async (options: { config?: string; json?: boolean }) => {
      const result = await syncReaderIndex({ configPath: options.config });
      process.stdout.write(options.json ? renderJson(result) : renderHumanSyncReaderIndex(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
