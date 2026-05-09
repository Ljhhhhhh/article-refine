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
    const lines = [
      "Link processed and saved",
      "",
      `Title: ${result.title}`,
      `Type: ${result.contentType}`,
      `Saved: ${result.obsidian.path}`,
      `Tags: ${result.obsidian.tags.join(" ")}`
    ];

    if (result.oss) {
      if (result.oss.uploaded) {
        lines.push(`OSS: ${result.oss.url}`);
      } else {
        lines.push(`OSS: upload failed (${result.oss.error.code}: ${result.oss.error.message})`);
      }
    }
    lines.push("");
    return lines.join("\n");
  }

  return "";
}
