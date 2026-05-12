import { describe, expect, test } from "vitest";
import {
  buildProcessArgs,
  formatCliExecutionError,
  formatProcessResult,
  parseProcessResult,
  parseProcessResultFromExecFileError,
  validateHttpUrl,
} from "../../extensions/raycast/src/link-processing-cli.js";

describe("validateHttpUrl", () => {
  test("accepts http and https URLs", () => {
    expect(validateHttpUrl("https://example.com/a")).toBe(
      "https://example.com/a",
    );
    expect(validateHttpUrl("http://example.com/a")).toBe(
      "http://example.com/a",
    );
  });

  test("rejects non-http URLs", () => {
    expect(() => validateHttpUrl("file:///tmp/a.md")).toThrow(
      "仅支持 http/https 链接。",
    );
    expect(() => validateHttpUrl("not a url")).toThrow("请输入有效 URL。");
  });
});

describe("buildProcessArgs", () => {
  test("builds source runtime invocation using the current Node executable and tsx import hook", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "source",
      url: "https://example.com/a",
      duplicatePolicy: "skip",
      ossEnabled: false,
    });

    expect(invocation).toEqual({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        "/repo/src/cli/index.ts",
        "process",
        "https://example.com/a",
        "--json",
        "--skip-existing",
        "--no-oss",
      ],
      cwd: "/repo",
    });
  });

  test("builds dist runtime invocation using the current Node executable", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "dist",
      url: "https://example.com/a",
      duplicatePolicy: "update",
      ossEnabled: true,
    });

    expect(invocation).toEqual({
      command: process.execPath,
      args: [
        "/repo/dist/cli/index.js",
        "process",
        "https://example.com/a",
        "--json",
        "--update-existing",
      ],
      cwd: "/repo",
    });
  });

  test("allows an explicit Node binary path to override the Raycast runtime executable", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "dist",
      url: "https://example.com/a",
      duplicatePolicy: "create",
      ossEnabled: true,
      nodePath: "/opt/homebrew/bin/node",
    });

    expect(invocation.command).toBe("/opt/homebrew/bin/node");
  });
});

describe("parseProcessResult", () => {
  test("parses successful process JSON", () => {
    const result = parseProcessResult(
      JSON.stringify({
        ok: true,
        command: "process",
        sourceUrl: "https://example.com/a",
        title: "Example",
        obsidian: {
          relativePath: "文章摘要/综合/Example.md",
          path: "/vault/文章摘要/综合/Example.md",
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok && !("skipped" in result && result.skipped)) {
      expect(result.title).toBe("Example");
    }
  });

  test("throws on non-json output", () => {
    expect(() => parseProcessResult("not json")).toThrow(
      "CLI 未返回有效 JSON。",
    );
  });
});

describe("parseProcessResultFromExecFileError", () => {
  test("parses JSON stdout from a failed CLI process", () => {
    const failure = {
      ok: false,
      command: "process",
      sourceUrl: "https://example.com/a",
      error: {
        code: "CONTENT_TOO_SHORT",
        message: "Fetched content is below the quality threshold.",
      },
    };

    expect(
      parseProcessResultFromExecFileError({
        stdout: JSON.stringify(failure),
      }),
    ).toEqual(failure);
  });

  test("parses JSON stdout when execFile returns a Buffer", () => {
    const failure = {
      ok: false,
      command: "process",
      sourceUrl: "https://example.com/a",
      error: { code: "OSS_UPLOAD_FAILED", message: "upload failed" },
    };

    expect(
      parseProcessResultFromExecFileError({
        stdout: Buffer.from(JSON.stringify(failure), "utf8"),
      }),
    ).toEqual(failure);
  });

  test("parses JSON stdout when logs are printed before or after it", () => {
    const failure = {
      ok: false,
      command: "process",
      sourceUrl: "https://example.com/a",
      error: { code: "LLM_OUTPUT_INVALID", message: "bad output" },
    };

    expect(
      parseProcessResultFromExecFileError({
        stdout: `warning: noisy dependency log\n${JSON.stringify(failure, null, 2)}\ntrailing log`,
      }),
    ).toEqual(failure);
  });

  test("returns undefined when the failed process did not emit JSON stdout", () => {
    expect(
      parseProcessResultFromExecFileError({ stderr: "boom" }),
    ).toBeUndefined();
    expect(
      parseProcessResultFromExecFileError({ stdout: "not json" }),
    ).toBeUndefined();
  });
});

describe("formatProcessResult", () => {
  test("formats saved result", () => {
    expect(
      formatProcessResult({
        ok: true,
        command: "process",
        sourceUrl: "https://example.com/a",
        title: "Example",
        obsidian: {
          relativePath: "文章摘要/综合/Example.md",
          path: "/vault/文章摘要/综合/Example.md",
        },
      }),
    ).toEqual({
      title: "已保存到 Obsidian",
      message: "Example — 文章摘要/综合/Example.md",
    });
  });

  test("formats skipped result", () => {
    expect(
      formatProcessResult({
        ok: true,
        command: "process",
        sourceUrl: "https://example.com/a",
        skipped: true,
        reason: "SOURCE_ALREADY_EXISTS",
        existingPath: "/vault/existing.md",
      }),
    ).toEqual({
      title: "笔记已存在",
      message: "/vault/existing.md",
    });
  });

  test("formats failure result", () => {
    expect(
      formatProcessResult({
        ok: false,
        command: "process",
        sourceUrl: "https://example.com/a",
        error: { code: "FETCH_FAILED", message: "boom", retryable: true },
      }),
    ).toEqual({
      title: "保存失败",
      message: "FETCH_FAILED: boom",
    });
  });
});

describe("formatCliExecutionError", () => {
  test("includes stdout and stderr snippets when JSON could not be parsed", () => {
    const error = Object.assign(
      new Error("Command failed: node cli.js process"),
      {
        stdout: "plain stdout detail",
        stderr: "plain stderr detail",
      },
    );

    expect(formatCliExecutionError(error)).toContain(
      "Command failed: node cli.js process",
    );
    expect(formatCliExecutionError(error)).toContain(
      "标准输出: plain stdout detail",
    );
    expect(formatCliExecutionError(error)).toContain(
      "标准错误: plain stderr detail",
    );
  });
});
