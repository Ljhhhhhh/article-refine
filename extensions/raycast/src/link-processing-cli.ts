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
};

export type CliInvocation = {
  command: string;
  args: string[];
  cwd: string;
};

export function validateHttpUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid URL.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }

  return parsed.toString();
}

export function buildProcessArgs(input: CliInvocationInput): CliInvocation {
  const projectPath = path.resolve(input.projectPath);
  const duplicateArgs =
    input.duplicatePolicy === "skip"
      ? ["--skip-existing"]
      : input.duplicatePolicy === "update"
        ? ["--update-existing"]
        : [];
  const ossArgs = input.ossEnabled ? [] : ["--no-oss"];
  const processArgs = ["process", input.url, "--json", ...duplicateArgs, ...ossArgs];

  if (input.runtime === "dist") {
    return {
      command: "node",
      args: [path.join(projectPath, "dist", "cli", "index.js"), ...processArgs],
      cwd: projectPath
    };
  }

  return {
    command: "pnpm",
    args: ["--dir", projectPath, "exec", "tsx", "src/cli/index.ts", ...processArgs],
    cwd: projectPath
  };
}

export function parseProcessResult(stdout: string): ProcessResult {
  try {
    return JSON.parse(stdout) as ProcessResult;
  } catch {
    throw new Error("CLI did not return valid JSON.");
  }
}

export function formatProcessResult(result: ProcessResult): { title: string; message: string } {
  if (!result.ok) {
    return {
      title: "Save Failed",
      message: `${result.error.code}: ${result.error.message}`
    };
  }

  if ("skipped" in result && result.skipped) {
    return {
      title: "Already Exists",
      message: result.existingPath
    };
  }

  const notePath = result.obsidian?.relativePath ?? result.obsidian?.path ?? "";
  return {
    title: "Saved to Obsidian",
    message: [result.title, notePath].filter(Boolean).join(" — ")
  };
}

export async function runLinkProcessingCli(
  input: CliInvocationInput,
  timeoutMs: number
): Promise<ProcessResult> {
  const invocation = buildProcessArgs(input);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10
  });

  return parseProcessResult(stdout);
}
