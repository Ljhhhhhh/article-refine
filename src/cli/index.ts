#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerProcessCommand } from "./commands/process.js";
import { registerRouteCommand } from "./commands/route.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("link-processing")
    .description("Process links into Obsidian-ready Markdown notes")
    .version("0.1.0");

  registerRouteCommand(program);
  registerInspectCommand(program);
  registerProcessCommand(program);
  registerConfigCommand(program);

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createProgram().parseAsync(process.argv);
}
