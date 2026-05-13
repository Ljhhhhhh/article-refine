import type { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "../tui/App.js";

export function registerTuiCommand(program: Command): void {
  program
    .command("tui")
    .argument("[url]")
    .option("--vault <path>", "Obsidian vault path")
    .option("--llm-provider <provider>", "LLM provider (mock|draft-revise)")
    .option("--llm-model <model>", "LLM model name (fallback for both passes)")
    .option("--llm-base-url <url>", "OpenAI-compatible API base URL")
    .option("--draft-model <model>", "Draft (Pass 1) LLM model name")
    .option("--revise-model <model>", "Revise (Pass 2, thinking) LLM model name")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--skip-existing", "skip processing if source URL already exists in the vault index")
    .option("--update-existing", "overwrite the existing note if source URL already exists")
    .option("--no-oss", "disable OSS mirror for this run even if configured")
    .action((url: string | undefined, options) => {
      render(React.createElement(App, { initialUrl: url, options }));
    });
}
