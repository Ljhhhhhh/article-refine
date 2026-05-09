import type { AppErrorCode } from "./errors.js";

export function getExitCodeForErrorCode(code: AppErrorCode): number {
  switch (code) {
    case "INVALID_URL":
    case "INVALID_OPTIONS":
    case "UNSUPPORTED_URL":
      return 2;
    case "FETCH_FAILED":
    case "CONTENT_TOO_SHORT":
      return 3;
    case "LLM_OUTPUT_INVALID":
      return 4;
    case "OBSIDIAN_CONFIG_MISSING":
    case "OBSIDIAN_WRITE_FAILED":
      return 5;
    case "OSS_CONFIG_INVALID":
    case "OSS_UPLOAD_FAILED":
      return 6;
    case "UNKNOWN_ERROR":
      return 1;
  }
}
