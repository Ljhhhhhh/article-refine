import type { Command } from "commander";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { writeDefaultConfig } from "../../config/load-config.js";
import { resolveProcessConfig } from "../../config/resolve-config.js";
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
      const resolved = await resolveProcessConfig({ configPath: options.path, cli: {} });
      if (!resolved.ok) {
        const failure = {
          ...resolved,
          command: "config"
        };
        process.stdout.write(
          options.json ? renderJson(failure) : `Config failed: ${resolved.error.message}\n`
        );
        process.exitCode = 1;
        return;
      }

      try {
        await mkdir(path.join(resolved.config.obsidian.vaultPath, "文章摘要"), { recursive: true });
        const success = {
          ok: true,
          config: resolved.config,
          configPath: resolved.configPath,
          loadedConfigFile: resolved.loadedConfigFile
        };
        process.stdout.write(options.json ? renderJson(success) : "Config OK\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Config check failed.";
        const failure = { ok: false, message };
        process.stdout.write(
          options.json ? renderJson(failure) : `Config failed: ${message}\n`
        );
        process.exitCode = 1;
      }
    });
}
