import { describe, expect, test } from "vitest";
import { createInitialTuiState, reduceTuiState, summarizeProcessResult } from "../../src/cli/tui/state.js";

describe("TUI state", () => {
  test("starts with input state when URL is not provided", () => {
    expect(createInitialTuiState()).toMatchObject({
      phase: "input",
      url: "",
      logs: [],
      steps: [
        { id: "validate", label: "解析链接", status: "pending" },
        { id: "fetch", label: "抓取内容", status: "pending" },
        { id: "generate", label: "生成笔记", status: "pending" },
        { id: "deliver", label: "保存/上传", status: "pending" }
      ]
    });
  });

  test("starts with running state when URL is provided", () => {
    expect(createInitialTuiState("https://example.com/a")).toMatchObject({
      phase: "running",
      url: "https://example.com/a"
    });
  });

  test("maps progress events onto pipeline steps", () => {
    let state = createInitialTuiState("https://example.com/a");
    state = reduceTuiState(state, { type: "progress", step: "fetching" });
    state = reduceTuiState(state, { type: "progress", step: "extracting" });

    expect(state.steps.map((step) => [step.id, step.status])).toEqual([
      ["validate", "done"],
      ["fetch", "done"],
      ["generate", "active"],
      ["deliver", "pending"]
    ]);
    expect(state.logs).toContain("正在抓取页面内容");
    expect(state.logs).toContain("正在生成结构化笔记");
  });

  test("summarizes successful OSS result", () => {
    expect(
      summarizeProcessResult({
        ok: true,
        command: "process",
        sourceUrl: "https://example.com/a",
        linkType: "general",
        contentType: "综合",
        title: "Example",
        oss: {
          uploaded: true,
          bucket: "notes",
          key: "文章摘要/综合/example.md",
          url: "oss://notes/文章摘要/综合/example.md",
          httpsUrl: "https://notes.example.com/example.md"
        }
      })
    ).toEqual({
      title: "Example",
      destination: "https://notes.example.com/example.md"
    });
  });
});
