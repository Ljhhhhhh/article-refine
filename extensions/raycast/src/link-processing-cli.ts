import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type DuplicatePolicy = "create" | "skip" | "update";
export type Runtime = "source" | "dist";

export type ProcessResult =
  | {
      ok: true;
      command: "process";
      sourceUrl: string;
      title?: string;
      obsidian?: { relativePath?: string; path?: string };
      skipped?: false;
    }
  | {
      ok: true;
      command: "process";
      sourceUrl: string;
      skipped: true;
      reason: "SOURCE_ALREADY_EXISTS";
      existingPath: string;
    }
  | {
      ok: false;
      command: string;
      sourceUrl?: string;
      error: { code: string; message: string; retryable?: boolean };
    };

export type CliInvocationInput = {
  projectPath: string;
  runtime: Runtime;
  url: string;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled: boolean;
  nodePath?: string;
};

export type CliInvocation = {
  command: string;
  args: string[];
  cwd: string;
};

function resolveNodeCommand(nodePath?: string): string {
  const trimmed = nodePath?.trim();
  return trimmed || process.execPath;
}

export function validateHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("请输入有效 URL。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接。");
  }

  return parsed.toString();
}

export function buildProcessArgs(input: CliInvocationInput): CliInvocation {
  const projectPath = path.resolve(input.projectPath);
  const nodeCmd = resolveNodeCommand(input.nodePath);
  const duplicateArgs =
    input.duplicatePolicy === "skip"
      ? ["--skip-existing"]
      : input.duplicatePolicy === "update"
        ? ["--update-existing"]
        : [];
  const ossArgs = input.ossEnabled ? [] : ["--no-oss"];
  const processArgs = [
    "process",
    input.url,
    "--json",
    ...duplicateArgs,
    ...ossArgs,
  ];

  if (input.runtime === "dist") {
    return {
      command: nodeCmd,
      args: [path.join(projectPath, "dist", "cli", "index.js"), ...processArgs],
      cwd: projectPath,
    };
  }

  return {
    command: nodeCmd,
    args: [
      "--import",
      "tsx",
      path.join(projectPath, "src", "cli", "index.ts"),
      ...processArgs,
    ],
    cwd: projectPath,
  };
}

export function parseProcessResult(stdout: string): ProcessResult {
  try {
    return JSON.parse(stdout) as ProcessResult;
  } catch {
    throw new Error("CLI 未返回有效 JSON。");
  }
}

function outputToString(output: unknown): string | undefined {
  if (typeof output === "string") {
    return output;
  }
  if (Buffer.isBuffer(output)) {
    return output.toString("utf8");
  }
  if (output instanceof Uint8Array) {
    return Buffer.from(output).toString("utf8");
  }
  return undefined;
}

function outputSnippet(output: unknown): string | undefined {
  const text = outputToString(output)?.trim();
  if (!text) {
    return undefined;
  }
  return text.length > 1000 ? `${text.slice(0, 1000)}...` : text;
}

function isProcessResult(value: unknown): value is ProcessResult {
  return typeof value === "object" && value !== null && "ok" in value;
}

function parseMaybeNoisyProcessResult(
  output: string,
): ProcessResult | undefined {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return isProcessResult(parsed) ? parsed : undefined;
  } catch {
    // Fall through and scan for a JSON object below.
  }

  for (let start = 0; start < trimmed.length; start += 1) {
    if (trimmed[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < trimmed.length; index += 1) {
      const char = trimmed[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const parsed = JSON.parse(trimmed.slice(start, index + 1));
            if (isProcessResult(parsed)) {
              return parsed;
            }
          } catch {
            break;
          }
        }
      }
    }
  }

  return undefined;
}

export function parseProcessResultFromExecFileError(
  error: unknown,
): ProcessResult | undefined {
  const stdout = outputToString((error as { stdout?: unknown })?.stdout);
  if (!stdout) {
    return undefined;
  }

  return parseMaybeNoisyProcessResult(stdout);
}

export function formatProcessResult(result: ProcessResult): {
  title: string;
  message: string;
} {
  if (!result.ok) {
    return {
      title: "保存失败",
      message: `${result.error.code}: ${result.error.message}`,
    };
  }

  if ("skipped" in result && result.skipped) {
    return {
      title: "笔记已存在",
      message: result.existingPath,
    };
  }

  const notePath = result.obsidian?.relativePath ?? result.obsidian?.path ?? "";
  return {
    title: "已保存到 Obsidian",
    message: [result.title, notePath].filter(Boolean).join(" — "),
  };
}

export function formatCliExecutionError(error: unknown): string {
  const base = error instanceof Error ? error.message : "未知错误。";
  const stdout = outputSnippet((error as { stdout?: unknown })?.stdout);
  const stderr = outputSnippet((error as { stderr?: unknown })?.stderr);
  const details = [
    stdout ? `标准输出: ${stdout}` : undefined,
    stderr ? `标准错误: ${stderr}` : undefined,
  ].filter(Boolean);

  return [base, ...details].join("\n\n");
}

export async function runLinkProcessingCli(
  input: CliInvocationInput,
  timeoutMs: number,
): Promise<ProcessResult> {
  const invocation = buildProcessArgs(input);
  const pathEntries = [
    path.join(invocation.cwd, "node_modules", ".bin"),
    path.dirname(invocation.command),
    process.env.PATH || "",
  ].filter(Boolean);
  try {
    const { stdout } = await execFileAsync(
      invocation.command,
      invocation.args,
      {
        cwd: invocation.cwd,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 10,
        env: { ...process.env, PATH: pathEntries.join(":") },
      },
    );

    return parseProcessResult(stdout);
  } catch (error) {
    const result = parseProcessResultFromExecFileError(error);
    if (result) {
      return result;
    }

    throw error;
  }
}
