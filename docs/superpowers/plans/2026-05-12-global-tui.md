# Global TUI Invocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a globally callable terminal UI so `lpa` and `link-processing tui` can process links with persistent progress, logs, and results outside Raycast.

**Architecture:** Extract the current `process` command orchestration into a shared `process-runner` module, then build an Ink-based TUI on top of that runner. Commander remains the CLI shell; `process`, `tui`, and future UI entrypoints reuse one config/OSS/duplicate-policy implementation.

**Tech Stack:** TypeScript ESM, Commander, Ink + React, Vitest, existing `processLink`/`resolveProcessConfig`/`OssUploader` services.

---

## File Structure

- Create `src/cli/process-runner.ts`: shared non-UI runner that resolves config, validates duplicate options, creates extractor/fetchers/OSS uploader, runs `processLink`, and emits progress events.
- Modify `src/cli/commands/process.ts`: shrink to Commander option parsing and rendering, delegating work to `runProcessCommand`.
- Create `tests/cli/process-runner.test.ts`: runner behavior tests for config errors, duplicate option errors, OSS-only with `--no-oss`, and progress forwarding.
- Create `src/cli/tui/state.ts`: pure TUI state reducer and formatting helpers.
- Create `tests/cli/tui-state.test.ts`: tests for state transitions and result formatting.
- Create `src/cli/tui/App.tsx`: Ink root component for URL input, progress dashboard, logs, result/error display, and keyboard shortcuts.
- Create `src/cli/commands/tui.ts`: Commander command that renders the Ink app.
- Modify `src/cli/index.ts`: register `tui`.
- Modify `package.json`: add `lpa` bin alias and Ink/React dependencies.
- Modify `tsconfig.json`: include `src/**/*.tsx` and set JSX support.
- Modify `README.md`: document `lpa`, global linking, and TUI shortcuts.

---

### Task 1: Extract Shared Process Runner

**Files:**
- Create: `src/cli/process-runner.ts`
- Modify: `src/cli/commands/process.ts`
- Test: `tests/cli/process-runner.test.ts`

- [ ] **Step 1: Write the failing runner tests**

Create `tests/cli/process-runner.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { runProcessCommand, selectDuplicatePolicy } from "../../src/cli/process-runner.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  process.env = { ...savedEnv };
  for (const key of [
    "LINK_PROCESSING_VAULT",
    "LINK_PROCESSING_LLM_PROVIDER",
    "LINK_PROCESSING_LLM_MODEL",
    "LINK_PROCESSING_DRAFT_MODEL",
    "LINK_PROCESSING_REVISE_MODEL",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "OSS_ENDPOINT",
    "OSS_REGION",
    "OSS_BUCKET",
    "OSS_ACCESS_KEY_ID",
    "OSS_SECRET_ACCESS_KEY",
    "OSS_PREFIX",
    "OSS_FORCE_PATH_STYLE",
    "OSS_MODE",
    "OSS_STRICT"
  ]) {
    delete process.env[key];
  }
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-runner-"));
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("selectDuplicatePolicy", () => {
  test("defaults to create", () => {
    expect(selectDuplicatePolicy({})).toBe("create");
  });

  test("maps skip and update flags", () => {
    expect(selectDuplicatePolicy({ skipExisting: true })).toBe("skip");
    expect(selectDuplicatePolicy({ updateExisting: true })).toBe("update");
  });

  test("rejects mutually exclusive duplicate flags", async () => {
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      vault: tempDir,
      llmProvider: "mock",
      skipExisting: true,
      updateExisting: true
    });

    expect(result).toEqual({
      ok: false,
      command: "process",
      sourceUrl: "https://example.dev/agent",
      error: {
        code: "INVALID_OPTIONS",
        message: "Cannot use --skip-existing and --update-existing together.",
        retryable: false
      }
    });
  });
});

describe("runProcessCommand", () => {
  test("returns a stable config error when local vault is required but missing", async () => {
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      oss: false,
      llmProvider: "mock"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
    }
  });

  test("honors --no-oss even when env requests OSS-only mode", async () => {
    process.env.OSS_ENDPOINT = "https://s3.example.com";
    process.env.OSS_REGION = "test-region";
    process.env.OSS_BUCKET = "test-bucket";
    process.env.OSS_ACCESS_KEY_ID = "test-access-key";
    process.env.OSS_SECRET_ACCESS_KEY = "test-secret";
    process.env.OSS_MODE = "only";

    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      oss: false,
      llmProvider: "mock"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
    }
  });

  test("forwards progress events from processLink", async () => {
    const steps: string[] = [];
    const result = await runProcessCommand("https://example.dev/agent", {
      config: path.join(tempDir, "missing.yaml"),
      vault: tempDir,
      llmProvider: "mock",
      onProgress: (step) => steps.push(step)
    });

    expect(result.ok).toBe(true);
    expect(steps).toEqual(expect.arrayContaining(["fetching", "extracting", "saving"]));
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
rtk pnpm test tests/cli/process-runner.test.ts
```

Expected: FAIL because `src/cli/process-runner.ts` does not exist.

- [ ] **Step 3: Implement `src/cli/process-runner.ts`**

Create `src/cli/process-runner.ts`:

```ts
import { processLink, type DuplicatePolicy, type ProcessOptions, type ProcessResult } from "../core/process-link.js";
import { resolveProcessConfig } from "../config/resolve-config.js";
import { createExtractor } from "../llm/factory.js";
import { TwitterFetcher } from "../fetchers/twitter-fetcher.js";
import { WebFetcher } from "../fetchers/web-fetcher.js";
import { OssUploader } from "../storage/oss-uploader.js";
import { shouldUseOssOnlyMode } from "./commands/process.js";

export type ProcessCommandOptions = {
  vault?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  draftModel?: string;
  reviseModel?: string;
  config?: string;
  skipExisting?: boolean;
  updateExisting?: boolean;
  oss?: boolean;
  onProgress?: (step: string) => void;
};

export function selectDuplicatePolicy(options: Pick<ProcessCommandOptions, "skipExisting" | "updateExisting">): DuplicatePolicy {
  if (options.updateExisting) return "update";
  if (options.skipExisting) return "skip";
  return "create";
}

function invalidOptions(sourceUrl: string, message: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: { code: "INVALID_OPTIONS", message, retryable: false }
  };
}

function missingVault(sourceUrl: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: {
      code: "OBSIDIAN_CONFIG_MISSING",
      message: "Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath when OSS-only mode is disabled.",
      retryable: false
    }
  };
}

function extractorFailure(sourceUrl: string, message: string): ProcessResult {
  return {
    ok: false,
    command: "process",
    sourceUrl,
    error: { code: "LLM_OUTPUT_INVALID", message, retryable: false }
  };
}

export async function runProcessCommand(sourceUrl: string, options: ProcessCommandOptions): Promise<ProcessResult> {
  const resolved = await resolveProcessConfig({
    configPath: options.config,
    cli: {
      vaultPath: options.vault,
      llmProvider: options.llmProvider,
      llmModel: options.llmModel,
      llmBaseUrl: options.llmBaseUrl,
      draftModel: options.draftModel,
      reviseModel: options.reviseModel
    }
  });

  if (!resolved.ok) return { ...resolved, sourceUrl };

  if (options.skipExisting && options.updateExisting) {
    return invalidOptions(sourceUrl, "Cannot use --skip-existing and --update-existing together.");
  }

  const config = resolved.config;
  const isOssOnly = shouldUseOssOnlyMode(config.storage.oss, options.oss);
  if (!isOssOnly && !config.obsidian.vaultPath) {
    return missingVault(sourceUrl);
  }

  let extractor;
  try {
    extractor = createExtractor({ ...config.llm, onProgress: options.onProgress });
  } catch (error) {
    return extractorFailure(sourceUrl, error instanceof Error ? error.message : "Extractor creation failed.");
  }

  let oss: ProcessOptions["oss"];
  if (config.storage.oss.enabled && options.oss !== false) {
    oss = {
      uploader: new OssUploader({
        endpoint: config.storage.oss.endpoint!,
        region: config.storage.oss.region!,
        bucket: config.storage.oss.bucket!,
        prefix: config.storage.oss.prefix,
        accessKeyId: config.storage.oss.accessKeyId!,
        secretAccessKey: config.storage.oss.secretAccessKey!,
        forcePathStyle: config.storage.oss.forcePathStyle
      }),
      prefix: config.storage.oss.prefix,
      strict: config.storage.oss.strict
    };
  }

  return processLink(sourceUrl, {
    vaultPath: isOssOnly ? undefined : config.obsidian.vaultPath,
    mode: isOssOnly ? "only" : "mirror",
    fetchers: [new TwitterFetcher(), new WebFetcher()],
    extractor,
    qualityThreshold: config.processing.qualityThreshold,
    onProgress: options.onProgress,
    duplicatePolicy: selectDuplicatePolicy(options),
    oss
  });
}
```

- [ ] **Step 4: Update `src/cli/commands/process.ts` to delegate to the runner**

Replace the action body in `registerProcessCommand` with:

```ts
        const onProgress = options.json
          ? undefined
          : (step: string) => {
              const labels: Record<string, string> = {
                fetching: "正在抓取内容...",
                preparing: "准备阶段：长文压缩（如需要）...",
                drafting: "Pass 1: 起草笔记...",
                revising: "Pass 2: 对照原文修订...",
                extracting: "正在生成结构化笔记...",
                saving: "保存到 Obsidian...",
                mirroring: "同步到 OSS...",
                uploading: "上传到 OSS..."
              };
              process.stderr.write(`  ${labels[step] ?? step}\n`);
            };

        const result = await runProcessCommand(url, { ...options, onProgress });
        process.stdout.write(options.json ? renderJson(result) : renderHumanProcessResult(result));
        if (!result.ok) process.exitCode = 1;
```

Keep `shouldUseOssOnlyMode` exported from this file so existing tests continue to pass.

- [ ] **Step 5: Run runner and process command tests**

Run:

```bash
rtk pnpm test tests/cli/process-runner.test.ts tests/cli/process-command.test.ts
```

Expected: PASS.

---

### Task 2: Add TUI State Model

**Files:**
- Create: `src/cli/tui/state.ts`
- Test: `tests/cli/tui-state.test.ts`

- [ ] **Step 1: Write the failing state tests**

Create `tests/cli/tui-state.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createInitialTuiState, reduceTuiState, summarizeProcessResult } from "../../src/cli/tui/state.js";

describe("TUI state", () => {
  test("starts with input state when URL is not provided", () => {
    expect(createInitialTuiState()).toMatchObject({
      phase: "input",
      url: "",
      logs: [],
      steps: [
        { id: "validate", label: "Validate URL", status: "pending" },
        { id: "fetch", label: "Fetch Content", status: "pending" },
        { id: "generate", label: "Generate Note", status: "pending" },
        { id: "deliver", label: "Save or Upload", status: "pending" }
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
    expect(state.logs).toContain("Fetch content");
    expect(state.logs).toContain("Generate note");
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk pnpm test tests/cli/tui-state.test.ts
```

Expected: FAIL because `src/cli/tui/state.ts` does not exist.

- [ ] **Step 3: Implement `src/cli/tui/state.ts`**

Create `src/cli/tui/state.ts`:

```ts
import type { ProcessResult } from "../../core/process-link.js";

export type TuiPhase = "input" | "running" | "success" | "failed";
export type TuiStepStatus = "pending" | "active" | "done" | "failed";
export type TuiStepId = "validate" | "fetch" | "generate" | "deliver";

export type TuiStep = {
  id: TuiStepId;
  label: string;
  status: TuiStepStatus;
};

export type TuiState = {
  phase: TuiPhase;
  url: string;
  logs: string[];
  steps: TuiStep[];
  result?: ProcessResult;
  error?: string;
};

export type TuiAction =
  | { type: "set-url"; url: string }
  | { type: "start"; url: string }
  | { type: "progress"; step: string }
  | { type: "result"; result: ProcessResult }
  | { type: "error"; message: string }
  | { type: "reset" };

const INITIAL_STEPS: TuiStep[] = [
  { id: "validate", label: "Validate URL", status: "pending" },
  { id: "fetch", label: "Fetch Content", status: "pending" },
  { id: "generate", label: "Generate Note", status: "pending" },
  { id: "deliver", label: "Save or Upload", status: "pending" }
];

const PROGRESS_MAP: Record<string, { active: TuiStepId; log: string; doneBefore: TuiStepId[] }> = {
  fetching: { active: "fetch", log: "Fetch content", doneBefore: ["validate"] },
  extracting: { active: "generate", log: "Generate note", doneBefore: ["validate", "fetch"] },
  drafting: { active: "generate", log: "Draft note", doneBefore: ["validate", "fetch"] },
  revising: { active: "generate", log: "Revise note", doneBefore: ["validate", "fetch"] },
  saving: { active: "deliver", log: "Save to Obsidian", doneBefore: ["validate", "fetch", "generate"] },
  mirroring: { active: "deliver", log: "Mirror to OSS", doneBefore: ["validate", "fetch", "generate"] },
  uploading: { active: "deliver", log: "Upload to OSS", doneBefore: ["validate", "fetch", "generate"] }
};

function cloneSteps(): TuiStep[] {
  return INITIAL_STEPS.map((step) => ({ ...step }));
}

export function createInitialTuiState(url = ""): TuiState {
  return {
    phase: url ? "running" : "input",
    url,
    logs: [],
    steps: cloneSteps()
  };
}

function markProgress(steps: TuiStep[], progress: { active: TuiStepId; doneBefore: TuiStepId[] }): TuiStep[] {
  return steps.map((step) => {
    if (progress.doneBefore.includes(step.id)) return { ...step, status: "done" };
    if (step.id === progress.active) return { ...step, status: "active" };
    return step;
  });
}

export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "set-url":
      return { ...state, url: action.url };
    case "start":
      return { ...createInitialTuiState(action.url), phase: "running" };
    case "progress": {
      const progress = PROGRESS_MAP[action.step];
      if (!progress) return { ...state, logs: [...state.logs, action.step] };
      return {
        ...state,
        steps: markProgress(state.steps, progress),
        logs: [...state.logs, progress.log]
      };
    }
    case "result": {
      const ok = action.result.ok;
      return {
        ...state,
        phase: ok ? "success" : "failed",
        result: action.result,
        steps: state.steps.map((step) => ({ ...step, status: ok ? "done" : step.status === "pending" ? "pending" : "failed" }))
      };
    }
    case "error":
      return {
        ...state,
        phase: "failed",
        error: action.message,
        logs: [...state.logs, action.message],
        steps: state.steps.map((step) => (step.status === "active" ? { ...step, status: "failed" } : step))
      };
    case "reset":
      return createInitialTuiState();
  }
}

export function summarizeProcessResult(result: ProcessResult): { title: string; destination: string } {
  if (!result.ok) return { title: result.error.code, destination: result.error.message };
  if ("skipped" in result && result.skipped) return { title: "Already exists", destination: result.existingPath };
  return {
    title: result.title,
    destination: result.oss?.uploaded ? result.oss.httpsUrl : result.obsidian?.path ?? result.obsidian?.relativePath ?? ""
  };
}
```

- [ ] **Step 4: Run state tests**

Run:

```bash
rtk pnpm test tests/cli/tui-state.test.ts
```

Expected: PASS.

---

### Task 3: Add Ink TUI Command

**Files:**
- Create: `src/cli/tui/App.tsx`
- Create: `src/cli/commands/tui.ts`
- Modify: `src/cli/index.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`
- Test: `tests/cli/tui-command.test.ts`

- [ ] **Step 1: Add dependencies and TypeScript config**

Modify `package.json` dependencies:

```json
"dependencies": {
  "@aws-sdk/client-s3": "^3.1045.0",
  "@mozilla/readability": "latest",
  "cheerio": "latest",
  "commander": "latest",
  "dotenv": "^17.4.2",
  "ink": "^5.2.1",
  "jsdom": "latest",
  "openai": "^6.37.0",
  "react": "^18.3.1",
  "turndown": "^7.2.4",
  "turndown-plugin-gfm": "^1.0.2",
  "undici": "^8.2.0",
  "yaml": "latest",
  "zod": "latest"
}
```

Modify `package.json` devDependencies:

```json
"devDependencies": {
  "@types/jsdom": "latest",
  "@types/node": "latest",
  "@types/react": "^18.3.12",
  "@types/turndown": "^5.0.6",
  "aws-sdk-client-mock": "^4.1.0",
  "ink-testing-library": "^3.0.0",
  "tsup": "latest",
  "tsx": "latest",
  "typescript": "latest",
  "vitest": "latest"
}
```

Modify `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "ignoreDeprecations": "6.0",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": ".",
    "jsx": "react-jsx",
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
rtk pnpm install
```

Expected: `pnpm-lock.yaml` updates and install exits 0. If network is blocked, rerun with escalated permission.

- [ ] **Step 3: Write failing command registration test**

Create `tests/cli/tui-command.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createProgram } from "../../src/cli/index.js";

describe("tui command", () => {
  test("is registered on the root program", () => {
    const program = createProgram();
    expect(program.commands.map((command) => command.name())).toContain("tui");
  });

  test("accepts an optional URL argument", () => {
    const program = createProgram();
    const tui = program.commands.find((command) => command.name() === "tui");
    expect(tui?.registeredArguments.map((argument) => argument.name())).toEqual(["url"]);
    expect(tui?.registeredArguments[0]?.required).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
rtk pnpm test tests/cli/tui-command.test.ts
```

Expected: FAIL because `tui` command is not registered.

- [ ] **Step 5: Implement `src/cli/tui/App.tsx`**

Create `src/cli/tui/App.tsx`:

```tsx
import React, { useEffect, useReducer } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { runProcessCommand, type ProcessCommandOptions } from "../process-runner.js";
import { createInitialTuiState, reduceTuiState, summarizeProcessResult } from "./state.js";

export type AppProps = {
  initialUrl?: string;
  options: ProcessCommandOptions;
};

function statusSymbol(status: string): string {
  if (status === "done") return "✓";
  if (status === "active") return "⠋";
  if (status === "failed") return "✕";
  return "○";
}

export function App({ initialUrl, options }: AppProps) {
  const { exit } = useApp();
  const [state, dispatch] = useReducer(reduceTuiState, createInitialTuiState(initialUrl));

  useInput((input, key) => {
    if (input === "q" || key.escape) exit();
    if (state.phase === "input" && key.return && state.url.trim()) {
      dispatch({ type: "start", url: state.url.trim() });
    } else if (state.phase === "input" && input) {
      dispatch({ type: "set-url", url: `${state.url}${input}` });
    } else if (state.phase === "input" && key.backspace) {
      dispatch({ type: "set-url", url: state.url.slice(0, -1) });
    } else if (input === "r" && state.url.trim()) {
      dispatch({ type: "start", url: state.url.trim() });
    }
  });

  useEffect(() => {
    if (state.phase !== "running" || !state.url.trim()) return;
    let cancelled = false;
    runProcessCommand(state.url.trim(), {
      ...options,
      onProgress: (step) => {
        if (!cancelled) dispatch({ type: "progress", step });
        options.onProgress?.(step);
      }
    })
      .then((result) => {
        if (!cancelled) dispatch({ type: "result", result });
      })
      .catch((error) => {
        if (!cancelled) dispatch({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, state.url]);

  const summary = state.result ? summarizeProcessResult(state.result) : undefined;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">Link Processing Agent</Text>
      <Text color="gray">q: quit · r: retry</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Source: {state.url || "Paste a URL and press Enter"}</Text>
        {state.phase === "input" ? <Text color="yellow">URL: {state.url}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {state.steps.map((step) => (
          <Text key={step.id} color={step.status === "failed" ? "red" : step.status === "done" ? "green" : step.status === "active" ? "cyan" : "gray"}>
            {statusSymbol(step.status)} {step.label}
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Logs</Text>
        {state.logs.slice(-8).map((log, index) => <Text key={`${log}-${index}`} color="gray">{log}</Text>)}
      </Box>
      {summary ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={state.phase === "success" ? "green" : "red"}>{state.phase === "success" ? "Saved" : "Failed"}</Text>
          <Text>{summary.title}</Text>
          <Text>{summary.destination}</Text>
        </Box>
      ) : null}
      {state.error ? <Text color="red">{state.error}</Text> : null}
    </Box>
  );
}
```

- [ ] **Step 6: Implement `src/cli/commands/tui.ts`**

Create `src/cli/commands/tui.ts`:

```ts
import type { Command } from "commander";
import React from "react";
import { render } from "ink";
import { App } from "../tui/App.js";

export function registerTuiCommand(program: Command): void {
  program
    .command("tui")
    .argument("[url]")
    .option("--vault <path>", "Obsidian vault path")
    .option("--llm-provider <provider>", "LLM provider (mock|draft-revise)")
    .option("--llm-model <model>", "LLM model name (fallback for both passes)")
    .option("--llm-base-url <url>", "OpenAI-compatible API base URL")
    .option("--draft-model <model>", "Draft (Pass 1) LLM model name")
    .option("--revise-model <model>", "Revise (Pass 2, thinking) LLM model name")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--skip-existing", "skip processing if source URL already exists in the vault index")
    .option("--update-existing", "overwrite the existing note if source URL already exists")
    .option("--no-oss", "disable OSS mirror for this run even if configured")
    .action((url: string | undefined, options) => {
      render(<App initialUrl={url} options={options} />);
    });
}
```

- [ ] **Step 7: Register `tui` in `src/cli/index.ts`**

Add the import:

```ts
import { registerTuiCommand } from "./commands/tui.js";
```

Add the registration before `registerServeCommand(program);`:

```ts
  registerTuiCommand(program);
```

- [ ] **Step 8: Run command registration test**

Run:

```bash
rtk pnpm test tests/cli/tui-command.test.ts
```

Expected: PASS.

---

### Task 4: Add Global Alias and Build Support

**Files:**
- Modify: `package.json`
- Test: `tests/cli/bin-alias.test.ts`

- [ ] **Step 1: Write failing bin alias test**

Create `tests/cli/bin-alias.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("package bin aliases", () => {
  test("registers lpa as a global alias for the CLI", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { bin: Record<string, string> };
    expect(pkg.bin["link-processing"]).toBe("./dist/cli/index.js");
    expect(pkg.bin.lpa).toBe("./dist/cli/index.js");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk pnpm test tests/cli/bin-alias.test.ts
```

Expected: FAIL because `bin.lpa` is missing.

- [ ] **Step 3: Add `lpa` bin alias**

Modify `package.json`:

```json
"bin": {
  "link-processing": "./dist/cli/index.js",
  "lpa": "./dist/cli/index.js"
}
```

- [ ] **Step 4: Run alias test**

Run:

```bash
rtk pnpm test tests/cli/bin-alias.test.ts
```

Expected: PASS.

- [ ] **Step 5: Build and smoke test commands**

Run:

```bash
rtk pnpm build
rtk node dist/cli/index.js --help
rtk node dist/cli/index.js tui --help
```

Expected:
- Build exits 0.
- Root help lists `tui`.
- TUI help shows optional `[url]` and inherited process options.

---

### Task 5: Document Installation and Usage

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add TUI usage docs**

Add this section to `README.md`:

```md
## Terminal UI

Build and register the CLI globally:

```bash
pnpm build
pnpm link --global
```

Run the terminal UI from any directory:

```bash
lpa
lpa https://mp.weixin.qq.com/s/example
link-processing tui https://example.com/article
```

Shortcuts:

- `q` or `Esc`: quit
- `r`: retry the current URL
- `Enter`: submit a URL on the input screen

The TUI reuses the same configuration as `link-processing process`: `.env`, `link-processing.config.yaml`, `LINK_PROCESSING_*`, `OPENAI_*`, and `OSS_*` are resolved through the shared process runner.
```

- [ ] **Step 2: Verify README and full test suite**

Run:

```bash
rtk pnpm test
rtk pnpm typecheck
rtk pnpm build
```

Expected:
- All tests pass.
- TypeScript reports no errors.
- Build exits 0.

---

## Self-Review

- Spec coverage: The plan covers global invocation (`lpa`), TUI command (`link-processing tui`), progress/log/result display, reuse of existing process logic, OSS-only/`--no-oss` safety, and documentation.
- Red-flag scan: Each task includes concrete file paths, code, commands, and expected outcomes.
- Type consistency: `ProcessCommandOptions`, `TuiState`, `TuiAction`, and `AppProps` are defined before use and reused consistently across tasks.
