import { describe, expect, test } from "vitest";
import {
  buildProcessArgs,
  formatProcessResult,
  parseProcessResult,
  validateHttpUrl
} from "../../extensions/raycast/src/link-processing-cli.js";

describe("validateHttpUrl", () => {
  test("accepts http and https URLs", () => {
    expect(validateHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(validateHttpUrl("http://example.com/a")).toBe("http://example.com/a");
  });

  test("rejects non-http URLs", () => {
    expect(() => validateHttpUrl("file:///tmp/a.md")).toThrow("Only http(s) URLs are supported.");
    expect(() => validateHttpUrl("not a url")).toThrow("Enter a valid URL.");
  });
});

describe("buildProcessArgs", () => {
  test("builds source runtime invocation without shell syntax", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "source",
      url: "https://example.com/a",
      duplicatePolicy: "skip",
      ossEnabled: false
    });

    expect(invocation).toEqual({
      command: "node",
      args: [
        "/repo/node_modules/.bin/tsx",
        "/repo/src/cli/index.ts",
        "process",
        "https://example.com/a",
        "--json",
        "--skip-existing",
        "--no-oss"
      ],
      cwd: "/repo"
    });
  });

  test("builds dist runtime invocation", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "dist",
      url: "https://example.com/a",
      duplicatePolicy: "update",
      ossEnabled: true
    });

    expect(invocation).toEqual({
      command: "node",
      args: ["/repo/dist/cli/index.js", "process", "https://example.com/a", "--json", "--update-existing"],
      cwd: "/repo"
    });
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
        obsidian: { relativePath: "文章摘要/综合/Example.md", path: "/vault/文章摘要/综合/Example.md" }
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok && !("skipped" in result && result.skipped)) {
      expect(result.title).toBe("Example");
    }
  });

  test("throws on non-json output", () => {
    expect(() => parseProcessResult("not json")).toThrow("CLI did not return valid JSON.");
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
        obsidian: { relativePath: "文章摘要/综合/Example.md", path: "/vault/文章摘要/综合/Example.md" }
      })
    ).toEqual({
      title: "Saved to Obsidian",
      message: "Example — 文章摘要/综合/Example.md"
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
        existingPath: "/vault/existing.md"
      })
    ).toEqual({
      title: "Already Exists",
      message: "/vault/existing.md"
    });
  });

  test("formats failure result", () => {
    expect(
      formatProcessResult({
        ok: false,
        command: "process",
        sourceUrl: "https://example.com/a",
        error: { code: "FETCH_FAILED", message: "boom", retryable: true }
      })
    ).toEqual({
      title: "Save Failed",
      message: "FETCH_FAILED: boom"
    });
  });
});
