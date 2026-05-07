export type AppErrorCode =
  | "INVALID_URL"
  | "UNSUPPORTED_URL"
  | "FETCH_FAILED"
  | "CONTENT_TOO_SHORT"
  | "LLM_OUTPUT_INVALID"
  | "OBSIDIAN_CONFIG_MISSING"
  | "OBSIDIAN_WRITE_FAILED"
  | "UNKNOWN_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.retryable = retryable;
  }
}

export type FailureResult = {
  ok: false;
  command: string;
  sourceUrl?: string;
  error: {
    code: AppErrorCode;
    message: string;
    retryable: boolean;
  };
};

export function toFailureResult(
  command: string,
  error: unknown,
  sourceUrl?: string
): FailureResult {
  if (error instanceof AppError) {
    return {
      ok: false,
      command,
      sourceUrl,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable
      }
    };
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    ok: false,
    command,
    sourceUrl,
    error: {
      code: "UNKNOWN_ERROR",
      message,
      retryable: false
    }
  };
}
