import type { Command } from "commander";
import { inspectLink } from "../../core/inspect-link.js";
import { WebFetcher } from "../../fetchers/web-fetcher.js";
import { TwitterFetcher } from "../../fetchers/twitter-fetcher.js";
import { renderJson } from "../presenters/json.js";

export function registerInspectCommand(program: Command): void {
  program
    .command("inspect")
    .argument("<url>")
    .option("--json", "print machine-readable JSON")
    .action(async (url: string) => {
      const result = await inspectLink(url, {
        fetchers: [new TwitterFetcher(), new WebFetcher()],
        qualityThreshold: 300
      });
      process.stdout.write(renderJson(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
