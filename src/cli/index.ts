#!/usr/bin/env node
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "../../.env") });

import { Command } from "commander";
import { registerInspectCommand } from "./commands/inspect.js";
import { registerConfigCommand } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerProcessCommand } from "./commands/process.js";
import { registerReaderCommand } from "./commands/reader.js";
import { registerRouteCommand } from "./commands/route.js";
import { registerServeCommand } from "./commands/serve.js";
import { registerTuiCommand } from "./commands/tui.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("link-processing")
    .description("Process links into Obsidian-ready Markdown notes")
    .version("0.1.0");

  registerRouteCommand(program);
  registerInspectCommand(program);
  registerProcessCommand(program);
  registerReaderCommand(program);
  registerConfigCommand(program);
  registerDoctorCommand(program);
  registerTuiCommand(program);
  registerServeCommand(program);

  return program;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await createProgram().parseAsync(process.argv);
}
