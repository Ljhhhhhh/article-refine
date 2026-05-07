import type { Command } from "commander";
import { routeLink } from "../../core/route-link.js";
import { renderJson } from "../presenters/json.js";

export function registerRouteCommand(program: Command): void {
  program
    .command("route")
    .argument("<url>")
    .option("--json", "print machine-readable JSON")
    .action((url: string, options: { json?: boolean }) => {
      const result = routeLink(url);
      const output = renderJson(result);
      process.stdout.write(output);
      if (!result.ok) {
        process.exitCode = 2;
      }
    });
}
