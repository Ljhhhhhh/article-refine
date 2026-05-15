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

  if ("title" in result) {
    const lines = [
      result.obsidian ? "Link processed and saved" : "Link processed and uploaded",
      "",
      `Title: ${result.title}`,
      `Type: ${result.contentType}`,
      `Clickbait: ${result.clickbaitIndex}/10`
    ];

    if (result.obsidian) {
      lines.push(`Saved: ${result.obsidian.path}`);
      lines.push(`Tags: ${result.obsidian.tags.join(" ")}`);
    }

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
