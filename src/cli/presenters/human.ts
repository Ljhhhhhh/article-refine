import type { ProcessResult } from "../../core/process-link.js";

const ERROR_CODE_LABELS: Record<string, string> = {
  INVALID_URL: "链接格式无效",
  INVALID_OPTIONS: "参数错误",
  UNSUPPORTED_URL: "不支持的链接类型",
  FETCH_FAILED: "内容抓取失败",
  FILE_NOT_FOUND: "文件未找到",
  CONTENT_TOO_SHORT: "抓取内容过短",
  LLM_OUTPUT_INVALID: "笔记生成失败",
  OBSIDIAN_CONFIG_MISSING: "Obsidian 配置缺失",
  OBSIDIAN_WRITE_FAILED: "写入 Obsidian 失败",
  OSS_UPLOAD_FAILED: "OSS 上传失败",
  OSS_CONFIG_INVALID: "OSS 配置无效",
  HTTP_SERVER_FAILED: "本地服务启动失败",
  SETTINGS_UPDATE_FAILED: "设置更新失败",
  UNKNOWN_ERROR: "未知错误"
};

export function renderHumanProcessResult(result: ProcessResult): string {
  if (!result.ok) {
    const label = ERROR_CODE_LABELS[result.error.code] ?? result.error.code;
    return `处理失败: ${label}\n\n${result.error.message}\n`;
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
