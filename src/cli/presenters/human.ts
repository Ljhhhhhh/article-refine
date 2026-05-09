import type { ProcessResult } from "../../core/process-link.js";

export function renderHumanProcessResult(result: ProcessResult): string {
  if (!result.ok) {
    return `Link processing failed\n\nError: ${result.error.code}\nMessage: ${result.error.message}\n`;
  }

  if ("skipped" in result && result.skipped) {
    return [
      "Link already processed",
      "",
      `Existing: ${result.existingPath}`,
      "Action: skipped",
      ""
    ].join("\n");
  }

  if ("obsidian" in result) {
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

  return "";
}
