import type { ProcessResult } from "../../core/process-link.js";

export function renderHumanProcessResult(result: ProcessResult): string {
  if (!result.ok) {
    return `Link processing failed\n\nError: ${result.error.code}\nMessage: ${result.error.message}\n`;
  }

  return [
    "Link processed and saved",
    "",
    `Title: ${result.title}`,
    `Type: ${result.contentType}`,
    `Saved: ${result.obsidian.path}`,
    `Tags: ${result.obsidian.tags.join(" ")}`,
    ""
  ].join("\n");
}
