import type { Command } from "commander";
import { checkConfig, writeDefaultConfig } from "../../config/load-config.js";
import { renderJson } from "../presenters/json.js";

export function registerConfigCommand(program: Command): void {
  const config = program.command("config");

  config
    .command("init")
    .option("--path <path>", "config path", "link-processing.config.yaml")
    .requiredOption("--vault <path>", "Obsidian vault path")
    .action(async (options: { path: string; vault: string }) => {
      await writeDefaultConfig(options.path, options.vault);
      process.stdout.write(`Config written: ${options.path}\n`);
    });

  config
    .command("check")
    .option("--path <path>", "config path", "link-processing.config.yaml")
    .option("--json", "print machine-readable JSON")
    .action(async (options: { path: string; json?: boolean }) => {
      const result = await checkConfig(options.path);
      process.stdout.write(options.json ? renderJson(result) : `${result.ok ? "Config OK" : `Config failed: ${result.message}`}\n`);
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
