import type { ProcessResult } from "../../core/process-link.js";

const recommendedSaveLabel = {
  strong: "强烈推荐",
  normal: "一般推荐",
  reference: "仅作参考"
} as const;

export function renderHumanProcessResult(result: ProcessResult): string {
  if (!result.ok) {
    return `Link processing failed\n\nError: ${result.error.code}\nMessage: ${result.error.message}\n`;
  }

  return [
    "Link processed and saved",
    "",
    `Title: ${result.title}`,
    `Type: ${result.contentType}`,
    `Quality: ${recommendedSaveLabel[result.quality.recommendedSave]}`,
    `Saved: ${result.obsidian.path}`,
    `Tags: ${result.obsidian.tags.join(" ")}`,
    ""
  ].join("\n");
}
