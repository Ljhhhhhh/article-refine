# Raycast CLI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Chinese-language Raycast command that wakes from Raycast Root Search, accepts one URL argument, invokes the existing `link-processing process <url> --json` CLI, and reports the saved/skipped/failed result with concise Chinese Raycast toasts.

**Architecture:** Keep Raycast as a thin local launcher with a compact native view. The Raycast extension lives in `extensions/raycast/`, validates the URL, builds a shell-free `child_process.execFile` invocation, runs the project CLI in the repository working directory, parses the existing JSON result contract, and displays the outcome with short Chinese labels. No HTTP server, no background daemon, no decorative UI, and no changes to the core processing pipeline are required for the MVP.

**Tech Stack:** TypeScript, Raycast Extension API (`@raycast/api`), Node `child_process.execFile`, Vitest for pure CLI helper tests, existing `pnpm` project scripts.

---

## Scope Check

This plan implements:

- A source-controlled Raycast extension under `extensions/raycast/`.
- One `view` Raycast command named `save-url`.
- One required Raycast text argument named `url`.
- Chinese Raycast command title, description, placeholder, preference labels, dropdown choices, toast titles/messages, actions, and README text.
- Minimal, efficient Raycast interaction: Root Search argument input plus a compact native progress/detail view and final toast.
- Raycast preferences for project path, runtime mode, duplicate policy, OSS toggle, and timeout.
- Shell-free CLI invocation using `execFile`.
- JSON parsing for the existing `ProcessResult` output.
- User-facing toasts for processing, saved, skipped, and failed states.
- Tests for command building, URL validation, and JSON result parsing.
- Documentation for installing and running the extension locally with Raycast.
- A small pre-flight fix for the current `pnpm typecheck` failure.

This plan does **not** implement:

- Raycast AI Tools integration.
- Streaming progress from `/v1/process?stream=1`.
- Starting or managing `link-processing serve`.
- Publishing to the Raycast Store.
- Capturing the current browser tab URL automatically.
- A decorative or multi-page Raycast UI. Use only a compact native view for progress/result and a minimal fallback form.

## UX Direction

- **Language:** All user-visible Raycast strings are Chinese. Keep `name`, preference keys, and TypeScript identifiers in English because Raycast and code APIs expect stable machine-readable identifiers.
- **Interaction style:** One command, one required URL argument, one Enter press, a compact progress view, and one final toast. Avoid nested choices, long helper copy, icons-as-decoration, or marketing language.
- **Tone:** Functional and compact: `保存链接到 Obsidian`, `正在保存`, `已保存`, `笔记已存在`, `保存失败`, `复制错误`.
- **Layout:** Use Raycast native Root Search argument UI, native Preferences, and native `Detail`/`Form` components only. Prefer short labels that fit in Raycast’s compact rows.
- **Accessibility:** Toasts must include a clear status title and actionable message. Failure toasts must expose `复制错误` so the user can paste the exact diagnostic elsewhere.

## File Structure Map

### New Files

| File                                            | Responsibility                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `extensions/raycast/package.json`               | Raycast extension manifest, commands, preferences, scripts, dependencies.                   |
| `extensions/raycast/tsconfig.json`              | TypeScript config for the Raycast extension package.                                        |
| `extensions/raycast/src/save-url.tsx`           | Raycast `view` command entry point with compact progress/result UI.                         |
| `extensions/raycast/src/link-processing-cli.ts` | Pure helper for URL validation, CLI argument construction, CLI execution, and JSON parsing. |
| `extensions/raycast/README.md`                  | Local install, develop, and usage instructions.                                             |
| `tests/raycast/link-processing-cli.test.ts`     | Vitest coverage for helper behavior without requiring Raycast.                              |

### Modified Files

| File                              | Change                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `src/errors/exit-codes.ts`        | Map `SETTINGS_UPDATE_FAILED` to exit code `7` so strict typecheck is exhaustive. |
| `tests/errors/exit-codes.test.ts` | Add coverage for `SETTINGS_UPDATE_FAILED`.                                       |
| `README.md`                       | Add a short Chinese Raycast section pointing to `extensions/raycast/README.md`.  |

### External References

- Raycast command manifest, command modes, arguments, and preferences: `https://developers.raycast.com/information/manifest`
- Raycast command arguments lifecycle: `https://developers.raycast.com/information/lifecycle/arguments`
- Raycast toast feedback API: `https://developers.raycast.com/api-reference/feedback/toast`

---

## Task 1: Restore Baseline Typecheck

**Why first:** Current `rtk pnpm typecheck` fails before any Raycast work. Fixing the exhaustive switch gives the project a clean baseline and makes final verification meaningful.

**Files:**

- Modify: `src/errors/exit-codes.ts`
- Modify: `tests/errors/exit-codes.test.ts`

- [ ] **Step 1: Write the failing test**

Modify `tests/errors/exit-codes.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { getExitCodeForErrorCode } from "../../src/errors/exit-codes.js";

describe("getExitCodeForErrorCode", () => {
  test("maps URL errors to exit code 2", () => {
    expect(getExitCodeForErrorCode("INVALID_URL")).toBe(2);
    expect(getExitCodeForErrorCode("UNSUPPORTED_URL")).toBe(2);
    expect(getExitCodeForErrorCode("INVALID_OPTIONS")).toBe(2);
  });

  test("maps fetch and content errors to exit code 3", () => {
    expect(getExitCodeForErrorCode("FETCH_FAILED")).toBe(3);
    expect(getExitCodeForErrorCode("CONTENT_TOO_SHORT")).toBe(3);
  });

  test("maps LLM and Obsidian errors to dedicated exit codes", () => {
    expect(getExitCodeForErrorCode("LLM_OUTPUT_INVALID")).toBe(4);
    expect(getExitCodeForErrorCode("OBSIDIAN_CONFIG_MISSING")).toBe(5);
    expect(getExitCodeForErrorCode("OBSIDIAN_WRITE_FAILED")).toBe(5);
  });

  test("maps OSS errors to exit code 6", () => {
    expect(getExitCodeForErrorCode("OSS_CONFIG_INVALID")).toBe(6);
    expect(getExitCodeForErrorCode("OSS_UPLOAD_FAILED")).toBe(6);
  });

  test("maps local service errors to exit code 7", () => {
    expect(getExitCodeForErrorCode("HTTP_SERVER_FAILED")).toBe(7);
    expect(getExitCodeForErrorCode("SETTINGS_UPDATE_FAILED")).toBe(7);
  });

  test("maps unknown errors to exit code 1", () => {
    expect(getExitCodeForErrorCode("UNKNOWN_ERROR")).toBe(1);
  });
});
```

- [ ] **Step 2: Run the focused test and typecheck to verify the failure**

Run:

```bash
rtk pnpm test tests/errors/exit-codes.test.ts
rtk pnpm typecheck
```

Expected:

- Test fails because `SETTINGS_UPDATE_FAILED` currently falls through.
- Typecheck fails with `TS2366` in `src/errors/exit-codes.ts`.

- [ ] **Step 3: Implement the minimal mapping**

Modify `src/errors/exit-codes.ts`:

```ts
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
    case "HTTP_SERVER_FAILED":
    case "SETTINGS_UPDATE_FAILED":
      return 7;
    case "UNKNOWN_ERROR":
      return 1;
  }
}
```

- [ ] **Step 4: Verify the fix**

Run:

```bash
rtk pnpm test tests/errors/exit-codes.test.ts
rtk pnpm typecheck
```

Expected:

- `tests/errors/exit-codes.test.ts` passes.
- `rtk pnpm typecheck` exits `0`.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add src/errors/exit-codes.ts tests/errors/exit-codes.test.ts
rtk git commit -m "fix: handle settings update exit code"
```

---

## Task 2: Scaffold the Raycast Extension Package

**Why second:** Establish the extension manifest and package boundary before command logic. This keeps Raycast-specific dependencies out of the root package.

**Files:**

- Create: `extensions/raycast/package.json`
- Create: `extensions/raycast/tsconfig.json`
- Create: `extensions/raycast/README.md`

- [ ] **Step 1: Create the Raycast package manifest**

Create `extensions/raycast/package.json`:

```json
{
  "$schema": "https://www.raycast.com/schemas/extension.json",
  "name": "link-processing",
  "title": "LinkProcessingAgent",
  "description": "通过本地 LinkProcessingAgent CLI 将链接保存到 Obsidian。",
  "icon": "extension-icon.png",
  "author": "guanmo",
  "categories": ["Productivity", "Developer Tools"],
  "license": "MIT",
  "commands": [
    {
      "name": "save-url",
      "title": "保存链接到 Obsidian",
      "description": "用 LinkProcessingAgent CLI 处理链接",
      "mode": "view",
      "arguments": [
        {
          "name": "url",
          "type": "text",
          "placeholder": "粘贴 http/https 链接",
          "required": true
        }
      ]
    }
  ],
  "preferences": [
    {
      "name": "projectPath",
      "title": "项目路径",
      "type": "textfield",
      "required": true,
      "default": "/Users/guanmo/Documents/projects/linkProcessing",
      "placeholder": "/Users/guanmo/Documents/projects/linkProcessing"
    },
    {
      "name": "runtime",
      "title": "运行方式",
      "type": "dropdown",
      "required": true,
      "default": "source",
      "data": [
        { "title": "源码运行（pnpm exec tsx）", "value": "source" },
        { "title": "构建产物（node dist）", "value": "dist" }
      ]
    },
    {
      "name": "duplicatePolicy",
      "title": "重复链接",
      "type": "dropdown",
      "required": true,
      "default": "create",
      "data": [
        { "title": "新建笔记", "value": "create" },
        { "title": "跳过已有", "value": "skip" },
        { "title": "更新已有", "value": "update" }
      ]
    },
    {
      "name": "ossEnabled",
      "title": "同步到 OSS",
      "type": "checkbox",
      "required": false,
      "default": true
    },
    {
      "name": "timeoutSeconds",
      "title": "超时秒数",
      "type": "textfield",
      "required": true,
      "default": "180",
      "placeholder": "180"
    }
  ],
  "scripts": {
    "build": "ray build",
    "dev": "ray develop",
    "lint": "ray lint",
    "fix-lint": "ray lint --fix"
  },
  "dependencies": {
    "@raycast/api": "^1.93.0"
  },
  "devDependencies": {
    "@raycast/eslint-config": "^2.0.4",
    "@types/node": "^24.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "typescript": "^5.8.0"
  }
}
```

- [ ] **Step 2: Create extension TypeScript config**

Create `extensions/raycast/tsconfig.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create local usage documentation**

Create `extensions/raycast/README.md`:

````md
# LinkProcessingAgent Raycast 扩展

在 Raycast 中输入链接，一步保存到 Obsidian。扩展直接调用本地 LinkProcessingAgent CLI，不依赖 HTTP 服务。

## 准备

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm dev -- doctor
```
````

默认“源码运行”会执行：

```bash
pnpm --dir /Users/guanmo/Documents/projects/linkProcessing exec tsx src/cli/index.ts process <url> --json
```

“构建产物”会执行：

```bash
node /Users/guanmo/Documents/projects/linkProcessing/dist/cli/index.js process <url> --json
```

## 本地调试

```bash
cd extensions/raycast
npm install
npm run dev
```

在 Raycast 中运行 **保存链接到 Obsidian**，粘贴 URL，然后按 Enter。

## 偏好设置

- **项目路径**：当前仓库的绝对路径。
- **运行方式**：开发时用 `source`；执行过 `pnpm build` 后可用 `dist`。
- **重复链接**：对应默认新建、`--skip-existing` 或 `--update-existing`。
- **同步到 OSS**：关闭后会追加 `--no-oss`。
- **超时秒数**：CLI 进程最长运行时间。

## 排障

- 如果 Raycast 提示 `pnpm not found`，先运行 `pnpm build`，再把运行方式改成 `dist`。
- 如果处理失败且提示配置问题，在仓库根目录运行 `pnpm dev -- doctor`。
- 如果 `dist` 找不到 `dist/cli/index.js`，运行 `pnpm build`。

````

- [ ] **Step 4: Verify manifest shape with package install**

Run:

```bash
cd extensions/raycast
npm install
````

Expected:

- `node_modules/` is created in `extensions/raycast`.
- `package-lock.json` is created.
- No package install errors.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add extensions/raycast/package.json extensions/raycast/package-lock.json extensions/raycast/tsconfig.json extensions/raycast/README.md
rtk git commit -m "feat: scaffold raycast extension"
```

---

## Task 3: Add the Shell-Free CLI Helper

**Why third:** This is the core MVP behavior and can be tested without Raycast. The helper owns validation, command construction, process execution, timeout handling, and JSON parsing.

**Files:**

- Create: `extensions/raycast/src/link-processing-cli.ts`
- Create: `tests/raycast/link-processing-cli.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `tests/raycast/link-processing-cli.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  buildProcessArgs,
  formatProcessResult,
  parseProcessResult,
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
  test("builds source runtime invocation without shell syntax", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "source",
      url: "https://example.com/a",
      duplicatePolicy: "skip",
      ossEnabled: false,
    });

    expect(invocation).toEqual({
      command: "pnpm",
      args: [
        "--dir",
        "/repo",
        "exec",
        "tsx",
        "src/cli/index.ts",
        "process",
        "https://example.com/a",
        "--json",
        "--skip-existing",
        "--no-oss",
      ],
      cwd: "/repo",
    });
  });

  test("builds dist runtime invocation", () => {
    const invocation = buildProcessArgs({
      projectPath: "/repo",
      runtime: "dist",
      url: "https://example.com/a",
      duplicatePolicy: "update",
      ossEnabled: true,
    });

    expect(invocation).toEqual({
      command: "node",
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
    expect(result.title).toBe("Example");
  });

  test("throws on non-json output", () => {
    expect(() => parseProcessResult("not json")).toThrow(
      "CLI did not return valid JSON.",
    );
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
rtk pnpm test tests/raycast/link-processing-cli.test.ts
```

Expected: FAIL because `extensions/raycast/src/link-processing-cli.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `extensions/raycast/src/link-processing-cli.ts`:

```ts
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
    throw new Error("请输入有效 URL。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 链接。");
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
  const processArgs = [
    "process",
    input.url,
    "--json",
    ...duplicateArgs,
    ...ossArgs,
  ];

  if (input.runtime === "dist") {
    return {
      command: "node",
      args: [path.join(projectPath, "dist", "cli", "index.js"), ...processArgs],
      cwd: projectPath,
    };
  }

  return {
    command: "pnpm",
    args: [
      "--dir",
      projectPath,
      "exec",
      "tsx",
      "src/cli/index.ts",
      ...processArgs,
    ],
    cwd: projectPath,
  };
}

export function parseProcessResult(stdout: string): ProcessResult {
  try {
    return JSON.parse(stdout) as ProcessResult;
  } catch {
    throw new Error("CLI did not return valid JSON.");
  }
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

export async function runLinkProcessingCli(
  input: CliInvocationInput,
  timeoutMs: number,
): Promise<ProcessResult> {
  const invocation = buildProcessArgs(input);
  const { stdout } = await execFileAsync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024 * 10,
  });

  return parseProcessResult(stdout);
}
```

- [ ] **Step 4: Verify helper tests pass**

Run:

```bash
rtk pnpm test tests/raycast/link-processing-cli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
rtk git add extensions/raycast/src/link-processing-cli.ts tests/raycast/link-processing-cli.test.ts
rtk git commit -m "feat: add raycast cli helper"
```

---

## Task 4: Implement the Raycast `save-url` Command

**Why fourth:** The tested helper now gives the Raycast command a small surface: read argument/preferences, show toasts, run helper, display result.

**Files:**

- Create: `extensions/raycast/src/save-url.tsx`

- [ ] **Step 1: Create the command entry point**

Create `extensions/raycast/src/save-url.tsx`:

```ts
import {
  Clipboard,
  LaunchProps,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import {
  DuplicatePolicy,
  Runtime,
  formatProcessResult,
  runLinkProcessingCli,
  validateHttpUrl,
} from "./link-processing-cli.js";

type Arguments = {
  url: string;
};

type Preferences = {
  projectPath: string;
  runtime: Runtime;
  duplicatePolicy: DuplicatePolicy;
  ossEnabled?: boolean;
  timeoutSeconds: string;
};

function parseTimeoutMs(value: string): number {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 180_000;
  return seconds * 1000;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown error.";
}

export default async function Command(
  props: LaunchProps<{ arguments: Arguments }>,
) {
  const preferences = getPreferenceValues<Preferences>();
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "正在保存到 Obsidian",
  });

  try {
    const url = validateHttpUrl(props.arguments.url);
    toast.message = url;

    const result = await runLinkProcessingCli(
      {
        projectPath: preferences.projectPath,
        runtime: preferences.runtime,
        url,
        duplicatePolicy: preferences.duplicatePolicy,
        ossEnabled: preferences.ossEnabled !== false,
      },
      parseTimeoutMs(preferences.timeoutSeconds),
    );

    const formatted = formatProcessResult(result);
    toast.title = formatted.title;
    toast.message = formatted.message;
    toast.style = result.ok ? Toast.Style.Success : Toast.Style.Failure;

    if (!result.ok) {
      toast.primaryAction = {
        title: "复制错误",
        onAction: () => Clipboard.copy(formatted.message),
      };
    }
  } catch (error) {
    const message = errorMessage(error);
    toast.title = "保存失败";
    toast.message = message;
    toast.style = Toast.Style.Failure;
    toast.primaryAction = {
      title: "复制错误",
      onAction: () => Clipboard.copy(message),
    };
  }
}
```

- [ ] **Step 2: Build the Raycast extension**

Run:

```bash
cd extensions/raycast
npm run build
```

Expected: Raycast build exits `0`.

- [ ] **Step 3: Manually test in Raycast development mode**

Run:

```bash
cd extensions/raycast
npm run dev
```

Then in Raycast:

1. Open **保存链接到 Obsidian**.
2. Enter `https://example.com/article`.
3. Press Enter.

Expected:

- A compact Chinese processing toast appears: `正在保存到 Obsidian`.
- On success, an `已保存到 Obsidian` toast shows the note title/path.
- On duplicate with `重复链接 = 跳过已有`, a `笔记已存在` toast shows the existing path.
- On invalid URL such as `file:///tmp/a`, a `保存失败` toast says `仅支持 http/https 链接。`

- [ ] **Step 4: Commit**

Run:

```bash
rtk git add extensions/raycast/src/save-url.tsx
rtk git commit -m "feat: add raycast save url command"
```

---

## Task 5: Document Raycast in the Root README

**Why fifth:** The extension is source-controlled but discoverability should start from the project README.

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Add the README section**

Modify `README.md` after the Chrome Extension section:

````md
### Raycast 扩展

`extensions/raycast/` 目录包含一个本地 Raycast 扩展，界面文案为中文，交互保持简约：在 Raycast 中输入一个 URL，扩展直接调用 CLI，不需要 HTTP 服务。

```bash
cd extensions/raycast
npm install
npm run dev
```
````

在 Raycast 中运行 **保存链接到 Obsidian**，输入 URL，然后按 Enter。

如果仓库不在 `/Users/guanmo/Documents/projects/linkProcessing`，或希望在 `pnpm build` 后使用构建产物运行，请在 Raycast 偏好设置里调整项目路径和运行方式。

````

- [ ] **Step 2: Verify Markdown references**

Run:

```bash
rtk rg -n "Raycast 扩展|extensions/raycast|保存链接到 Obsidian" README.md extensions/raycast/README.md
````

Expected: Both README files mention the Raycast command and `extensions/raycast`.

- [ ] **Step 3: Commit**

Run:

```bash
rtk git add README.md extensions/raycast/README.md
rtk git commit -m "docs: document raycast extension"
```

---

## Task 6: Final Verification

**Why last:** Prove the root project, helper tests, and Raycast package are all healthy.

**Files:**

- Verify only.

- [ ] **Step 1: Run root tests**

Run:

```bash
rtk pnpm test
```

Expected: all Vitest tests pass, including `tests/raycast/link-processing-cli.test.ts`.

- [ ] **Step 2: Run root typecheck**

Run:

```bash
rtk pnpm typecheck
```

Expected: exits `0`.

- [ ] **Step 3: Run Raycast build**

Run:

```bash
cd extensions/raycast
npm run build
```

Expected: Raycast build exits `0`.

- [ ] **Step 4: Run Raycast lint**

Run:

```bash
cd extensions/raycast
npm run lint
```

Expected: Raycast lint exits `0`.

- [ ] **Step 5: Manual smoke test with mock provider**

From repository root, ensure the CLI can run with mock provider:

```bash
rtk pnpm dev -- process https://example.com/article --llm-provider mock --json --no-oss
```

Expected: JSON output with `ok: true` and an `obsidian.path`, or a clear configuration error that can be fixed with `pnpm dev -- config init --vault <path>`.

Then run the same URL through Raycast **保存链接到 Obsidian**.

Expected: Raycast shows a final success/failure toast matching the CLI JSON result.

---

## Self-Review Checklist

- Spec coverage: The plan covers the requested MVP CLI invocation path, Root Search URL argument, CLI process execution, result display, tests, and docs.
- Placeholder scan: No banned placeholder tokens, no undefined steps, and no generic "add tests" instructions without concrete test code.
- Type consistency: `Runtime`, `DuplicatePolicy`, `CliInvocationInput`, `ProcessResult`, `validateHttpUrl`, `buildProcessArgs`, `parseProcessResult`, `formatProcessResult`, and `runLinkProcessingCli` are introduced before use and referenced consistently.
- Scope discipline: HTTP server, SSE streaming, Raycast AI Tools, browser-tab capture, and Raycast Store publishing are explicitly out of scope.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-raycast-cli-mvp.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each task.

Which approach?
