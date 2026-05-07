#!/usr/bin/env node
import { Command } from "commander";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("link-processing")
    .description("Process links into Obsidian-ready Markdown notes")
    .version("0.1.0");

  program.command("route").argument("<url>").action(() => {
    throw new Error("route command is not registered yet");
  });

  program.command("inspect").argument("<url>").action(() => {
    throw new Error("inspect command is not registered yet");
  });

  program.command("process").argument("<url>").action(() => {
    throw new Error("process command is not registered yet");
  });

  program.command("config").argument("<action>").action(() => {
    throw new Error("config command is not registered yet");
  });

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createProgram().parseAsync(process.argv);
}
