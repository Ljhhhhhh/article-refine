import type { Command } from "commander";
import { runDoctor, type DoctorResult } from "../../core/doctor.js";
import { renderJson } from "../presenters/json.js";

function renderHumanDoctor(result: DoctorResult): string {
  const lines = [result.ok ? "Doctor checks passed" : "Doctor checks failed", ""];
  for (const check of result.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.label}: ${check.message}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--json", "print machine-readable JSON")
    .action(async (options: { config: string; json?: boolean }) => {
      const result = await runDoctor({ configPath: options.config });
      process.stdout.write(options.json ? renderJson(result) : renderHumanDoctor(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
