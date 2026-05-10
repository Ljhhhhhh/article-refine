# Lightweight Invocation and Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LinkProcessingAgent callable without a terminal. Expose the existing core as (1) a reusable Node library, (2) a local HTTP server, and (3) an MCP server. Then ship a Chrome MV3 extension that saves the current tab or a link into Obsidian through the local HTTP server with a single click or keyboard shortcut.

**Architecture:** Do not rewrite the pipeline. `src/core/*` is already pure-function DI and `resolveProcessConfig` is CLI-independent. This plan adds three thin shells on top:

1. `src/index.ts` — public library facade `createAgent({ configPath, overrides })` that wires `resolveProcessConfig` + `createExtractor` + default fetchers + optional `OssUploader`.
2. `src/server/http.ts` + `src/cli/commands/serve.ts` — zero-dependency `node:http` server with `127.0.0.1` default bind, optional Bearer token, SSE progress, and per-URL mutex to prevent source-index races.
3. `src/mcp/server.ts` + `src/cli/commands/mcp.ts` — stdio MCP server exposing `process_link`, `route_link`, `inspect_link`, `doctor` tools, backed by the library facade.
4. `extensions/chrome/` — MV3 extension (background service worker + popup + options + context menu + command shortcut) that calls the HTTP server.

Each layer is independently deployable: the library works standalone; HTTP works without MCP; the extension works without MCP; MCP works without the extension.

**Tech Stack:** TypeScript, `node:http`, `@modelcontextprotocol/sdk` (Task 3 only), Commander, Vitest, Chrome MV3 (vanilla ES modules, no build step for the extension).

---

## Scope Check

This plan implements:

- Public library API (`createAgent`, re-exported core types) with proper `package.json` `exports`.
- Local HTTP server with `/v1/process`, `/v1/route`, `/v1/inspect`, `/v1/doctor`, `/v1/healthz`, optional SSE progress.
- Per-URL in-process mutex so concurrent requests to the same URL do not corrupt `source-index.json`.
- MCP stdio server exposing the same four operations as tools.
- Chrome MV3 extension: popup, context menu, keyboard shortcut, options page, background service worker.
- Minimal auth: Bearer token for HTTP; default `127.0.0.1` bind; extension sends token from options.

This plan does **not** implement:

- Publishing to the Chrome Web Store (manual load-unpacked is enough for v1).
- Firefox port (MV3 differences minor, but out of scope).
- Persistent job queue — each HTTP request is synchronous end-to-end.
- User accounts / multi-user auth — single-user local tool.
- Offline queue in the extension — if the server is down, the popup shows an error.

## File Structure Map

### New Files

| File | Responsibility |
|------|----------------|
| `src/index.ts` | Public library facade: `createAgent`, re-exports of core types. |
| `src/server/http.ts` | HTTP server core: route table, JSON body parser, SSE writer, per-URL mutex. |
| `src/server/auth.ts` | Bearer token check + host bind guard. |
| `src/server/url-lock.ts` | In-memory async mutex keyed by source URL. |
| `src/cli/commands/serve.ts` | `link-processing serve` subcommand. |
| `src/mcp/server.ts` | MCP stdio server setup, tool registration. |
| `src/cli/commands/mcp.ts` | `link-processing mcp` subcommand. |
| `tests/server/http.test.ts` | HTTP route contract tests (mock agent). |
| `tests/server/url-lock.test.ts` | Mutex fairness and ordering tests. |
| `tests/mcp/server.test.ts` | MCP tool listing and call tests. |
| `tests/index.test.ts` | `createAgent` integration smoke test with mock provider. |
| `extensions/chrome/manifest.json` | MV3 manifest. |
| `extensions/chrome/src/background.js` | Service worker: context menu, commands, message bus. |
| `extensions/chrome/src/api.js` | Shared fetch client for the local HTTP server. |
| `extensions/chrome/src/popup.html` | Popup UI. |
| `extensions/chrome/src/popup.js` | Popup logic. |
| `extensions/chrome/src/popup.css` | Popup styles. |
| `extensions/chrome/src/options.html` | Options page. |
| `extensions/chrome/src/options.js` | Options logic. |
| `extensions/chrome/src/options.css` | Options styles. |
| `extensions/chrome/README.md` | Load-unpacked instructions, permissions explanation. |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add `main`, `types`, `exports`, `files`; add `build` covering library + CLI; add `@modelcontextprotocol/sdk` dep (Task 3 only). |
| `src/cli/index.ts` | Register `serve` and `mcp` subcommands. |
| `src/errors/errors.ts` | Add `HTTP_SERVER_FAILED` code. |
| `src/errors/exit-codes.ts` | Map `HTTP_SERVER_FAILED` to `7`. |
| `README.md` | Add "Library API", "HTTP server", "MCP server", "Chrome extension" sections. |
| `tsup` build entry (via `package.json` scripts) | Build `src/index.ts` and `src/cli/index.ts` together. |

---

## Task 1: Public Library API (`createAgent` facade)

**Why first:** Everything else is a shell around this. HTTP, MCP, tests, external scripts all go through `createAgent`. Zero new dependencies.

**Files:**
- Create: `src/index.ts`
- Create: `tests/index.test.ts`
- Modify: `package.json`

### Steps

- [ ] **Step 1: Write a failing library smoke test**

Create `tests/index.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAgent } from "../src/index.js";
import { writeDefaultConfig } from "../src/config/load-config.js";

let tempDir: string;
let configPath: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-lib-"));
  configPath = path.join(tempDir, "link-processing.config.yaml");
  await writeDefaultConfig(configPath, tempDir);
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.LINK_PROCESSING_LLM_PROVIDER;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("createAgent", () => {
  test("exposes route, inspect, doctor, and process with mock provider", async () => {
    const agent = await createAgent({
      configPath,
      overrides: { llmProvider: "mock", vaultPath: tempDir }
    });
    try {
      const routed = agent.route("https://twitter.com/x/status/1");
      expect(routed.ok).toBe(true);

      const doctor = await agent.doctor();
      expect(doctor.checks.length).toBeGreaterThan(0);
    } finally {
      await agent.close();
    }
  });

  test("throws when config resolution fails (no vault anywhere)", async () => {
    const missingConfig = path.join(tempDir, "nope.yaml");
    await expect(
      createAgent({ configPath: missingConfig, overrides: {} })
    ).rejects.toMatchObject({ code: "OBSIDIAN_CONFIG_MISSING" });
  });
});
```

- [ ] **Step 2: Run the failing test**

```bash
pnpm test tests/index.test.ts
```

Expected: FAIL because `src/index.ts` does not exist.

- [ ] **Step 3: Implement the facade**

Create `src/index.ts`:

```ts
import { resolveProcessConfig, type ProcessCliOverrides } from "./config/resolve-config.js";
import { createExtractor } from "./llm/factory.js";
import { WebFetcher } from "./fetchers/web-fetcher.js";
import { TwitterFetcher } from "./fetchers/twitter-fetcher.js";
import { OssUploader } from "./storage/oss-uploader.js";
import { processLink, type ProcessOptions, type ProcessResult, type DuplicatePolicy } from "./core/process-link.js";
import { routeLink, type RouteResult } from "./core/route-link.js";
import { inspectLink, type InspectResult } from "./core/inspect-link.js";
import { runDoctor, type DoctorResult } from "./core/doctor.js";
import { AppError } from "./errors/errors.js";
import type { ContentFetcher } from "./fetchers/fetcher.js";
import type { NoteExtractor } from "./llm/note-extractor.js";
import type { LinkProcessingConfig } from "./config/schema.js";

export type { ProcessResult, RouteResult, InspectResult, DoctorResult, DuplicatePolicy };
export { processLink, routeLink, inspectLink, runDoctor };

export type CreateAgentInput = {
  configPath?: string;
  overrides?: ProcessCliOverrides;
  /** Override default fetchers. Default: [TwitterFetcher, WebFetcher]. */
  fetchers?: ContentFetcher[];
  /** Override the extractor (e.g. inject a pre-built one). Default: createExtractor(config.llm). */
  extractor?: NoteExtractor;
};

export type ProcessInput = {
  duplicatePolicy?: DuplicatePolicy;
  /** Disable OSS mirror for this single call even if configured. */
  oss?: boolean;
  onProgress?: (step: string) => void;
};

export type Agent = {
  readonly config: LinkProcessingConfig;
  readonly configPath: string;
  process(url: string, input?: ProcessInput): Promise<ProcessResult>;
  route(url: string): RouteResult;
  inspect(url: string): Promise<InspectResult>;
  doctor(): Promise<DoctorResult>;
  close(): Promise<void>;
};

export async function createAgent(input: CreateAgentInput = {}): Promise<Agent> {
  const resolved = await resolveProcessConfig({
    configPath: input.configPath,
    cli: input.overrides ?? {}
  });
  if (!resolved.ok) {
    throw new AppError(resolved.error.code, resolved.error.message);
  }

  const config = resolved.config;
  const fetchers = input.fetchers ?? [new TwitterFetcher(), new WebFetcher()];
  const extractor = input.extractor ?? createExtractor({ ...config.llm });

  const uploader = config.storage.oss.enabled
    ? new OssUploader({
        endpoint: config.storage.oss.endpoint!,
        region: config.storage.oss.region!,
        bucket: config.storage.oss.bucket!,
        prefix: config.storage.oss.prefix,
        accessKeyId: config.storage.oss.accessKeyId!,
        secretAccessKey: config.storage.oss.secretAccessKey!,
        forcePathStyle: config.storage.oss.forcePathStyle
      })
    : undefined;

  return {
    config,
    configPath: resolved.configPath,

    route(url) {
      return routeLink(url);
    },

    async inspect(url) {
      return inspectLink(url, {
        fetchers,
        qualityThreshold: config.processing.qualityThreshold
      });
    },

    async process(url, runtime = {}) {
      const oss: ProcessOptions["oss"] =
        uploader && runtime.oss !== false
          ? {
              uploader,
              prefix: config.storage.oss.prefix,
              strict: config.storage.oss.strict
            }
          : undefined;

      return processLink(url, {
        vaultPath: config.obsidian.vaultPath,
        fetchers,
        extractor,
        qualityThreshold: config.processing.qualityThreshold,
        duplicatePolicy: runtime.duplicatePolicy,
        onProgress: runtime.onProgress,
        oss
      });
    },

    async doctor() {
      return runDoctor({ configPath: resolved.configPath });
    },

    async close() {
      // Reserved for future resource cleanup (OSS client, keep-alive agents, etc.).
    }
  };
}
```

- [ ] **Step 4: Wire `package.json` exports**

Modify `package.json`:

```jsonc
{
  "name": "link-processing-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".":     { "import": "./dist/index.js",     "types": "./dist/index.d.ts" },
    "./cli": { "import": "./dist/cli/index.js" }
  },
  "files": ["dist", "README.md"],
  "bin": {
    "link-processing": "./dist/cli/index.js"
  },
  "scripts": {
    "build": "tsup src/index.ts src/cli/index.ts --format esm --dts --clean --out-dir dist",
    ...
  }
}
```

Note: tsup with two entries writes `dist/index.js`, `dist/index.d.ts`, `dist/cli/index.js`. Verify after build.

- [ ] **Step 5: Run tests and build**

```bash
pnpm test tests/index.test.ts
pnpm typecheck
pnpm build
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"
```

Expected: tests pass, typecheck clean, build emits both entries, node smoke prints `[ 'createAgent', 'processLink', 'routeLink', 'inspectLink', 'runDoctor' ]`.

- [ ] **Step 6: Commit**

```bash
git add src/index.ts tests/index.test.ts package.json
git commit -m "feat: expose createAgent library facade"
```

---

## Task 2: Local HTTP Server (`link-processing serve`)

**Why second:** Unlocks browser extensions (Task 4), Raycast/Alfred/Shortcuts, Obsidian Templater, cross-language scripts. Uses only `node:http`, no new dependencies.

**Files:**
- Create: `src/server/url-lock.ts`
- Create: `src/server/auth.ts`
- Create: `src/server/http.ts`
- Create: `src/cli/commands/serve.ts`
- Modify: `src/cli/index.ts`
- Modify: `src/errors/errors.ts`
- Modify: `src/errors/exit-codes.ts`
- Test: `tests/server/url-lock.test.ts`
- Test: `tests/server/http.test.ts`

### Steps

- [ ] **Step 1: Add `HTTP_SERVER_FAILED` error code**

Modify `src/errors/errors.ts` (`AppErrorCode` union) to add `"HTTP_SERVER_FAILED"`.

Modify `src/errors/exit-codes.ts`:

```ts
case "HTTP_SERVER_FAILED":
  return 7;
```

- [ ] **Step 2: Write URL lock tests**

Create `tests/server/url-lock.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { UrlLock } from "../../src/server/url-lock.js";

describe("UrlLock", () => {
  test("serializes concurrent operations on the same key", async () => {
    const lock = new UrlLock();
    const order: string[] = [];
    const slow = async (name: string) => {
      order.push(`enter ${name}`);
      await new Promise((r) => setTimeout(r, 10));
      order.push(`exit ${name}`);
    };
    await Promise.all([
      lock.run("u1", () => slow("a")),
      lock.run("u1", () => slow("b")),
      lock.run("u1", () => slow("c"))
    ]);
    expect(order).toEqual([
      "enter a", "exit a",
      "enter b", "exit b",
      "enter c", "exit c"
    ]);
  });

  test("does not block different keys", async () => {
    const lock = new UrlLock();
    const tasks: Array<Promise<number>> = [];
    const start = Date.now();
    for (let i = 0; i < 5; i++) {
      tasks.push(
        lock.run(`u${i}`, async () => {
          await new Promise((r) => setTimeout(r, 10));
          return i;
        })
      );
    }
    const results = await Promise.all(tasks);
    const elapsed = Date.now() - start;
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(elapsed).toBeLessThan(50);
  });

  test("releases lock even if the task throws", async () => {
    const lock = new UrlLock();
    await expect(
      lock.run("u1", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    // Next acquisition should not hang.
    await expect(lock.run("u1", async () => 42)).resolves.toBe(42);
  });
});
```

- [ ] **Step 3: Implement `UrlLock`**

Create `src/server/url-lock.ts`:

```ts
/**
 * Serializes async operations per-key. Used to prevent racing writes to
 * `source-index.json` when the same URL is processed concurrently.
 */
export class UrlLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(key, prev.then(() => gate));

    await prev;
    try {
      return await task();
    } finally {
      release();
      // Clean up if we are still the tail.
      if (this.tails.get(key) === gate) {
        this.tails.delete(key);
      }
    }
  }
}
```

Hmm — the sketch above has a subtle ordering issue (the tail isn't strictly the new task). Use this corrected version instead:

```ts
export class UrlLock {
  private readonly tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let releaseNext!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    this.tails.set(key, prev.then(() => next));

    await prev;
    try {
      return await task();
    } finally {
      releaseNext();
      // If nothing else chained on, garbage-collect the tail.
      if (this.tails.get(key) === next) {
        this.tails.delete(key);
      }
    }
  }
}
```

Run the tests:

```bash
pnpm test tests/server/url-lock.test.ts
```

Expected: pass.

- [ ] **Step 4: Implement auth helpers**

Create `src/server/auth.ts`:

```ts
import type { IncomingMessage } from "node:http";

export type AuthConfig = {
  token?: string;
  host: string;
};

export function assertLocalOrTokened(req: IncomingMessage, config: AuthConfig): { ok: true } | { ok: false; status: number; message: string } {
  if (config.token) {
    const header = req.headers["authorization"];
    if (!header || Array.isArray(header)) {
      return { ok: false, status: 401, message: "Missing Authorization header." };
    }
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || match[1] !== config.token) {
      return { ok: false, status: 401, message: "Invalid bearer token." };
    }
  }
  return { ok: true };
}

export function isLocalhostBind(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
```

- [ ] **Step 5: Write HTTP server contract tests**

Create `tests/server/http.test.ts`. Use a mock agent so we don't touch OpenAI or the filesystem vault:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createHttpServer } from "../../src/server/http.js";
import type { Agent } from "../../src/index.js";
import type { AddressInfo } from "node:net";

function mockAgent(): Agent {
  return {
    config: {} as Agent["config"],
    configPath: "/tmp/config.yaml",
    route: (url) => ({
      ok: true,
      command: "route",
      sourceUrl: url,
      linkType: "general",
      capability: { status: "stable", canProcess: true, canInspect: true, label: "x", notes: [] }
    } as ReturnType<Agent["route"]>),
    inspect: async (url) => ({
      ok: true, command: "inspect", sourceUrl: url, linkType: "general",
      wordCount: 10, contentType: "综合", recommendedTags: []
    } as Awaited<ReturnType<Agent["inspect"]>>),
    process: async (url) => ({
      ok: true, command: "process", sourceUrl: url, linkType: "general",
      contentType: "综合", title: "t",
      obsidian: { path: "/tmp/t.md", relativePath: "t.md", tags: [] }
    } as Awaited<ReturnType<Agent["process"]>>),
    doctor: async () => ({ ok: true, checks: [] }),
    close: async () => {}
  };
}

let server: { close: () => Promise<void>; port: number };

beforeEach(async () => {
  server = await startTestServer(mockAgent());
});

afterEach(async () => {
  await server.close();
});

async function startTestServer(agent: Agent, token?: string) {
  const http = createHttpServer({ agent, host: "127.0.0.1", port: 0, token });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as AddressInfo).port;
  return {
    port,
    close: () => new Promise<void>((r) => http.close(() => r()))
  };
}

async function request(port: number, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe("HTTP server", () => {
  test("GET /v1/healthz returns ok", async () => {
    const r = await request(server.port, "GET", "/v1/healthz");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true });
  });

  test("POST /v1/route returns RouteResult", async () => {
    const r = await request(server.port, "POST", "/v1/route", { url: "https://example.com" });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.command).toBe("route");
  });

  test("POST /v1/process returns 400 on missing url", async () => {
    const r = await request(server.port, "POST", "/v1/process", {});
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("INVALID_OPTIONS");
  });

  test("POST /v1/process returns ProcessResult", async () => {
    const r = await request(server.port, "POST", "/v1/process", { url: "https://example.com" });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.obsidian.path).toBeDefined();
  });

  test("unknown path returns 404", async () => {
    const r = await request(server.port, "GET", "/v1/unknown");
    expect(r.status).toBe(404);
  });

  test("enforces bearer token when configured", async () => {
    await server.close();
    server = await startTestServer(mockAgent(), "secret");
    const denied = await request(server.port, "POST", "/v1/route", { url: "https://example.com" });
    expect(denied.status).toBe(401);
    const ok = await request(
      server.port, "POST", "/v1/route", { url: "https://example.com" },
      { authorization: "Bearer secret" }
    );
    expect(ok.status).toBe(200);
  });
});
```

- [ ] **Step 6: Implement the HTTP server**

Create `src/server/http.ts`:

```ts
import http, { type IncomingMessage, type ServerResponse, type Server } from "node:http";
import type { Agent } from "../index.js";
import { assertLocalOrTokened, isLocalhostBind } from "./auth.js";
import { UrlLock } from "./url-lock.js";

export type HttpServerOptions = {
  agent: Agent;
  host: string;
  port: number;
  token?: string;
  allowNonLocal?: boolean;
  onLog?: (event: { level: "info" | "warn" | "error"; message: string }) => void;
};

export function createHttpServer(opts: HttpServerOptions): Server {
  if (!isLocalhostBind(opts.host) && !opts.allowNonLocal) {
    throw new Error(
      `Refusing to bind ${opts.host}. Pass --allow-non-local explicitly to expose the server.`
    );
  }

  const lock = new UrlLock();

  const server = http.createServer(async (req, res) => {
    try {
      await handle(req, res, opts, lock);
    } catch (err) {
      writeJson(res, 500, {
        ok: false,
        command: "server",
        error: {
          code: "HTTP_SERVER_FAILED",
          message: err instanceof Error ? err.message : "Unknown server error.",
          retryable: false
        }
      });
    }
  });
  return server;
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: HttpServerOptions, lock: UrlLock) {
  // CORS preflight — extensions need this when calling from background script.
  if (req.method === "OPTIONS") {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }
  setCors(res);

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);

  if (req.method === "GET" && url.pathname === "/v1/healthz") {
    return writeJson(res, 200, { ok: true });
  }

  const auth = assertLocalOrTokened(req, { token: opts.token, host: opts.host });
  if (!auth.ok) return writeJson(res, auth.status, { ok: false, error: { code: "UNAUTHORIZED", message: auth.message, retryable: false } });

  if (req.method === "GET" && url.pathname === "/v1/doctor") {
    const result = await opts.agent.doctor();
    return writeJson(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/route") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") return badRequest(res, "Field `url` is required.");
    const result = opts.agent.route(body.url);
    return writeJson(res, result.ok ? 200 : 400, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/inspect") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") return badRequest(res, "Field `url` is required.");
    const result = await opts.agent.inspect(body.url);
    return writeJson(res, result.ok ? 200 : 500, result);
  }

  if (req.method === "POST" && url.pathname === "/v1/process") {
    const body = await readJson(req);
    if (!body || typeof body.url !== "string") return badRequest(res, "Field `url` is required.");
    const useSse = url.searchParams.get("stream") === "1";

    if (!useSse) {
      const result = await lock.run(body.url, () =>
        opts.agent.process(body.url, {
          duplicatePolicy: body.duplicatePolicy,
          oss: body.oss
        })
      );
      return writeJson(res, result.ok ? 200 : 500, result);
    }

    // SSE streaming: emit progress events, then final result, then close.
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive"
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await lock.run(body.url, () =>
        opts.agent.process(body.url, {
          duplicatePolicy: body.duplicatePolicy,
          oss: body.oss,
          onProgress: (step) => send("progress", { step })
        })
      );
      send("result", result);
    } catch (err) {
      send("error", {
        code: "HTTP_SERVER_FAILED",
        message: err instanceof Error ? err.message : "process failed"
      });
    } finally {
      res.end();
    }
    return;
  }

  writeJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: `No route: ${req.method} ${url.pathname}` } });
}

function setCors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type,authorization");
}

function writeJson(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function badRequest(res: ServerResponse, message: string) {
  return writeJson(res, 400, {
    ok: false,
    error: { code: "INVALID_OPTIONS", message, retryable: false }
  });
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Register the `serve` CLI command**

Create `src/cli/commands/serve.ts`:

```ts
import type { Command } from "commander";
import { createAgent } from "../../index.js";
import { createHttpServer } from "../../server/http.js";

export function registerServeCommand(program: Command): void {
  program
    .command("serve")
    .description("Run local HTTP server for link processing")
    .option("--host <host>", "bind address", "127.0.0.1")
    .option("--port <port>", "port", "8787")
    .option("--token <token>", "require Authorization: Bearer <token>")
    .option("--allow-non-local", "allow binding non-loopback addresses")
    .option("--config <path>", "config path")
    .action(
      async (opts: {
        host: string;
        port: string;
        token?: string;
        allowNonLocal?: boolean;
        config?: string;
      }) => {
        const token = opts.token ?? process.env.LINK_PROCESSING_SERVE_TOKEN;
        const agent = await createAgent({ configPath: opts.config });
        const server = createHttpServer({
          agent,
          host: opts.host,
          port: Number(opts.port),
          token,
          allowNonLocal: opts.allowNonLocal
        });

        const port = Number(opts.port);
        server.listen(port, opts.host, () => {
          process.stderr.write(
            `link-processing serve listening on http://${opts.host}:${port}${token ? " (bearer required)" : ""}\n`
          );
        });

        const shutdown = () => {
          process.stderr.write("\nshutting down...\n");
          server.close(() => {
            agent.close().finally(() => process.exit(0));
          });
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
      }
    );
}
```

Modify `src/cli/index.ts` to register it:

```ts
import { registerServeCommand } from "./commands/serve.js";
...
registerServeCommand(program);
```

- [ ] **Step 8: Run tests and smoke-test the server**

```bash
pnpm test tests/server
pnpm typecheck
pnpm build
node dist/cli/index.js serve --port 8787 &
sleep 1
curl -s http://127.0.0.1:8787/v1/healthz
curl -s -X POST http://127.0.0.1:8787/v1/route -H 'content-type: application/json' -d '{"url":"https://example.com"}'
kill %1
```

Expected: both curl calls return `{"ok":true,...}`.

- [ ] **Step 9: Commit**

```bash
git add src/server src/cli/commands/serve.ts src/cli/index.ts src/errors/errors.ts src/errors/exit-codes.ts tests/server
git commit -m "feat: add local http serve command"
```

---

## Task 3: MCP Server (`link-processing mcp`)

**Why third:** Unlocks in-editor AI flows (Kiro, Claude Desktop, Cursor). Depends on Task 1 facade.

**Files:**
- Create: `src/mcp/server.ts`
- Create: `src/cli/commands/mcp.ts`
- Test: `tests/mcp/server.test.ts`
- Modify: `src/cli/index.ts`
- Modify: `package.json` (add `@modelcontextprotocol/sdk`)

### Steps

- [ ] **Step 1: Install the SDK**

```bash
pnpm add @modelcontextprotocol/sdk
```

- [ ] **Step 2: Write MCP tool listing test**

Create `tests/mcp/server.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { listMcpTools } from "../../src/mcp/server.js";

describe("MCP tool registration", () => {
  test("exposes the four operations", () => {
    const tools = listMcpTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["doctor", "inspect_link", "process_link", "route_link"]);
    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });
});
```

- [ ] **Step 3: Implement the MCP server**

Create `src/mcp/server.ts`:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Agent } from "../index.js";

type ToolDef = {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export function listMcpTools(): ToolDef[] {
  return [
    {
      name: "process_link",
      description: "Fetch the URL, generate a note, save it into the configured Obsidian vault, and optionally mirror to OSS.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Source URL (http/https)." },
          duplicatePolicy: {
            type: "string",
            enum: ["create", "skip", "update"],
            description: "Behavior when the same URL was processed before. Default: create."
          },
          oss: { type: "boolean", description: "Force-disable OSS mirror for this call when false." }
        },
        required: ["url"]
      }
    },
    {
      name: "route_link",
      description: "Classify a URL without fetching. Returns link type and capability flags.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    },
    {
      name: "inspect_link",
      description: "Fetch a URL and return a lightweight preview (title, author, word count) without saving.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"]
      }
    },
    {
      name: "doctor",
      description: "Run environment health checks: config, vault writable, LLM provider, OSS reachability.",
      inputSchema: { type: "object", properties: {} }
    }
  ];
}

export async function runMcpServer(agent: Agent): Promise<void> {
  const server = new Server(
    { name: "link-processing", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: listMcpTools()
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const a = (args ?? {}) as Record<string, unknown>;

    const result = await dispatch(agent, name, a);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function dispatch(agent: Agent, name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "route_link":
      return agent.route(String(args.url ?? ""));
    case "inspect_link":
      return agent.inspect(String(args.url ?? ""));
    case "process_link":
      return agent.process(String(args.url ?? ""), {
        duplicatePolicy: args.duplicatePolicy as any,
        oss: args.oss as boolean | undefined
      });
    case "doctor":
      return agent.doctor();
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

- [ ] **Step 4: Register the `mcp` CLI command**

Create `src/cli/commands/mcp.ts`:

```ts
import type { Command } from "commander";
import { createAgent } from "../../index.js";
import { runMcpServer } from "../../mcp/server.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("Run as MCP stdio server")
    .option("--config <path>", "config path")
    .action(async (opts: { config?: string }) => {
      const agent = await createAgent({ configPath: opts.config });
      await runMcpServer(agent);
    });
}
```

Modify `src/cli/index.ts`:

```ts
import { registerMcpCommand } from "./commands/mcp.js";
...
registerMcpCommand(program);
```

- [ ] **Step 5: Run tests and verify MCP handshake**

```bash
pnpm test tests/mcp
pnpm typecheck
pnpm build
```

Optional manual smoke (feeds a `tools/list` JSON-RPC request over stdio):

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/cli/index.js mcp
```

Expected: a JSON-RPC response listing the four tools.

- [ ] **Step 6: Commit**

```bash
git add src/mcp src/cli/commands/mcp.ts src/cli/index.ts package.json pnpm-lock.yaml tests/mcp
git commit -m "feat: add mcp stdio server"
```

---

## Task 4: Chrome MV3 Extension

**Why fourth:** Depends on Task 2 HTTP server being reachable at `http://127.0.0.1:8787`. Zero build step (vanilla ES modules + CSS). Load-unpacked for v1.

**Files:**
- Create: `extensions/chrome/manifest.json`
- Create: `extensions/chrome/src/background.js`
- Create: `extensions/chrome/src/api.js`
- Create: `extensions/chrome/src/popup.html`
- Create: `extensions/chrome/src/popup.js`
- Create: `extensions/chrome/src/popup.css`
- Create: `extensions/chrome/src/options.html`
- Create: `extensions/chrome/src/options.js`
- Create: `extensions/chrome/src/options.css`
- Create: `extensions/chrome/README.md`

### Design

**UX flows:**

1. **Toolbar click** → popup opens → shows current tab title/URL → user picks duplicate policy → clicks "Save" → popup shows live progress (SSE) → final result with vault path link.
2. **Context menu on page** → "Save to Obsidian (LinkProcessingAgent)" → background worker calls `/v1/process` → notification shows result.
3. **Context menu on link** → same action, using the link's `href` instead of the page URL.
4. **Keyboard shortcut** (default `Alt+Shift+S`) → same as context menu, for current tab.
5. **First run** → if options missing server URL → context menu click opens options page.

**Permissions (minimal):**

- `activeTab` — read current tab URL only when user invokes the action.
- `contextMenus` — right-click "Save to Obsidian".
- `notifications` — toast on success/failure.
- `storage` — persist server URL + token in `chrome.storage.local`.
- `host_permissions: ["http://127.0.0.1/*", "http://localhost/*"]` — required for `fetch` from a service worker to the local server.

**Security notes:**

- Token is stored in `chrome.storage.local`, not `chrome.storage.sync`, so it never leaves the device.
- Extension refuses to submit non-`http(s)://` URLs (e.g. `chrome://`, `file://`).
- Options page validates the server URL points to a loopback host by default; show a warning if it doesn't.

### Steps

- [ ] **Step 1: manifest.json**

Create `extensions/chrome/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "LinkProcessingAgent",
  "version": "0.1.0",
  "description": "Save the current tab into Obsidian via a local LinkProcessingAgent server.",
  "action": {
    "default_title": "Save to Obsidian",
    "default_popup": "src/popup.html"
  },
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "options_ui": {
    "page": "src/options.html",
    "open_in_tab": true
  },
  "permissions": ["activeTab", "contextMenus", "notifications", "storage"],
  "host_permissions": [
    "http://127.0.0.1/*",
    "http://localhost/*"
  ],
  "commands": {
    "save_current_tab": {
      "suggested_key": { "default": "Alt+Shift+S", "mac": "Alt+Shift+S" },
      "description": "Save current tab to Obsidian"
    }
  }
}
```

- [ ] **Step 2: shared API client**

Create `extensions/chrome/src/api.js` (ES module, reused by background + popup):

```js
const DEFAULT_SETTINGS = {
  serverUrl: "http://127.0.0.1:8787",
  token: "",
  duplicatePolicy: "create",
  ossEnabled: true
};

export async function getSettings() {
  const raw = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...raw };
}

export async function setSettings(patch) {
  const current = await getSettings();
  await chrome.storage.local.set({ ...current, ...patch });
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function checkHealth(settings) {
  const s = settings ?? (await getSettings());
  const res = await fetch(`${s.serverUrl}/v1/healthz`, { headers: authHeaders(s.token) });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function route(url, settings) {
  const s = settings ?? (await getSettings());
  const res = await fetch(`${s.serverUrl}/v1/route`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(s.token) },
    body: JSON.stringify({ url })
  });
  return res.json();
}

export async function processOnce(url, overrides = {}, settings) {
  const s = settings ?? (await getSettings());
  const body = {
    url,
    duplicatePolicy: overrides.duplicatePolicy ?? s.duplicatePolicy,
    oss: overrides.oss ?? s.ossEnabled
  };
  const res = await fetch(`${s.serverUrl}/v1/process`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(s.token) },
    body: JSON.stringify(body)
  });
  return res.json();
}

/**
 * Stream /v1/process via SSE. Calls onEvent({ type: "progress"|"result"|"error", data }).
 * Returns a promise that resolves with the final ProcessResult or rejects on transport error.
 */
export async function processStreaming(url, overrides, settings, onEvent) {
  const s = settings ?? (await getSettings());
  const body = JSON.stringify({
    url,
    duplicatePolicy: overrides?.duplicatePolicy ?? s.duplicatePolicy,
    oss: overrides?.oss ?? s.ossEnabled
  });
  const res = await fetch(`${s.serverUrl}/v1/process?stream=1`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...authHeaders(s.token) },
    body
  });
  if (!res.ok || !res.body) throw new Error(`process failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let finalResult = null;

  // SSE parser: events separated by "\n\n", fields "event:" and "data:".
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const evt = parseSseChunk(chunk);
      if (!evt) continue;
      onEvent?.(evt);
      if (evt.type === "result") finalResult = evt.data;
    }
  }
  if (!finalResult) throw new Error("Stream ended without result event.");
  return finalResult;
}

function parseSseChunk(chunk) {
  let event = "message";
  let dataLine = "";
  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
  }
  if (!dataLine) return null;
  try {
    return { type: event, data: JSON.parse(dataLine) };
  } catch {
    return { type: event, data: dataLine };
  }
}

export function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: background service worker**

Create `extensions/chrome/src/background.js`:

```js
import { getSettings, processOnce, isSupportedUrl } from "./api.js";

const MENU_ID_PAGE = "lp-save-page";
const MENU_ID_LINK = "lp-save-link";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID_PAGE,
    title: "Save to Obsidian (LinkProcessingAgent)",
    contexts: ["page"]
  });
  chrome.contextMenus.create({
    id: MENU_ID_LINK,
    title: "Save link to Obsidian (LinkProcessingAgent)",
    contexts: ["link"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url =
    info.menuItemId === MENU_ID_LINK
      ? info.linkUrl
      : info.pageUrl ?? tab?.url;
  await runSave(url);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save_current_tab") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return;
  await runSave(tab.url);
});

// Allow popup to delegate long-running work to the service worker.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "save") {
    runSave(msg.url, msg.overrides).then(sendResponse).catch((err) => sendResponse({ ok: false, error: { code: "EXTENSION_ERROR", message: err.message } }));
    return true; // async
  }
  return false;
});

async function runSave(url, overrides = {}) {
  if (!isSupportedUrl(url)) {
    await notify("Cannot save", "Only http(s) URLs are supported.");
    return { ok: false, error: { code: "INVALID_URL", message: "Only http(s) URLs are supported." } };
  }

  const settings = await getSettings();
  if (!settings.serverUrl) {
    await chrome.runtime.openOptionsPage();
    return { ok: false, error: { code: "NO_SERVER", message: "Server URL is not configured." } };
  }

  try {
    await notify("Saving to Obsidian...", url);
    const result = await processOnce(url, overrides, settings);
    if (result.ok && result.obsidian) {
      await notify("Saved to Obsidian", `${result.title}\n${result.obsidian.relativePath ?? result.obsidian.path}`);
    } else if (result.ok && result.skipped) {
      await notify("Already in vault", result.existingPath ?? url);
    } else {
      await notify("Save failed", result.error?.message ?? "unknown error");
    }
    return result;
  } catch (err) {
    await notify("Save failed", err.message);
    return { ok: false, error: { code: "NETWORK", message: err.message } };
  }
}

async function notify(title, message) {
  try {
    await chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/128.png"),
      title,
      message
    });
  } catch {
    // Ignore if notifications are disabled or icon is missing.
  }
}
```

- [ ] **Step 4: popup UI**

Create `extensions/chrome/src/popup.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <header>
      <h1>LinkProcessingAgent</h1>
      <button id="settings" title="Settings" aria-label="Settings">⚙</button>
    </header>

    <section class="target">
      <div class="label">Current tab</div>
      <div id="title" class="title">—</div>
      <div id="url" class="url">—</div>
    </section>

    <section class="controls">
      <label>
        Duplicate policy
        <select id="duplicatePolicy">
          <option value="create">Create</option>
          <option value="skip">Skip if exists</option>
          <option value="update">Update existing</option>
        </select>
      </label>
      <label class="inline">
        <input type="checkbox" id="ossEnabled" />
        Mirror to OSS (if configured)
      </label>
    </section>

    <button id="save" class="primary">Save to Obsidian</button>

    <section id="status" class="status" hidden>
      <div id="statusStep" class="step">—</div>
      <div id="statusDetail" class="detail"></div>
    </section>

    <section id="result" class="result" hidden></section>

    <footer>
      <span id="health" class="health">server: checking...</span>
    </footer>

    <script type="module" src="popup.js"></script>
  </body>
</html>
```

Create `extensions/chrome/src/popup.js`:

```js
import { getSettings, setSettings, checkHealth, processStreaming, isSupportedUrl } from "./api.js";

const $ = (id) => document.getElementById(id);

async function main() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await getSettings();

  $("title").textContent = tab?.title ?? "—";
  $("url").textContent = tab?.url ?? "—";
  $("duplicatePolicy").value = settings.duplicatePolicy;
  $("ossEnabled").checked = settings.ossEnabled !== false;

  if (!tab?.url || !isSupportedUrl(tab.url)) {
    $("save").disabled = true;
    $("save").textContent = "Unsupported URL";
  }

  $("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  $("duplicatePolicy").addEventListener("change", (e) => setSettings({ duplicatePolicy: e.target.value }));
  $("ossEnabled").addEventListener("change", (e) => setSettings({ ossEnabled: e.target.checked }));

  $("save").addEventListener("click", () => onSave(tab?.url));

  checkHealth(settings)
    .then((h) => ($("health").textContent = `server: ${h.ok ? "ok" : "down"} (${settings.serverUrl})`))
    .catch((err) => {
      $("health").textContent = `server: unreachable (${err.message})`;
      $("health").classList.add("bad");
    });
}

async function onSave(url) {
  if (!url || !isSupportedUrl(url)) return;
  const saveBtn = $("save");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  showStatus("starting", "");
  $("result").hidden = true;

  const overrides = {
    duplicatePolicy: $("duplicatePolicy").value,
    oss: $("ossEnabled").checked
  };

  try {
    const result = await processStreaming(url, overrides, undefined, (evt) => {
      if (evt.type === "progress") showStatus(evt.data.step, "");
      else if (evt.type === "error") showStatus("error", evt.data.message);
    });
    renderResult(result);
  } catch (err) {
    renderResult({ ok: false, error: { code: "NETWORK", message: err.message } });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save to Obsidian";
  }
}

function showStatus(step, detail) {
  const labels = {
    starting: "Starting...",
    fetching: "Fetching content...",
    preparing: "Compressing long content...",
    drafting: "Drafting note (pass 1)...",
    extracting: "Extracting...",
    revising: "Revising (pass 2)...",
    saving: "Saving to vault...",
    mirroring: "Mirroring to OSS...",
    error: "Error"
  };
  $("status").hidden = false;
  $("statusStep").textContent = labels[step] ?? step;
  $("statusDetail").textContent = detail ?? "";
}

function renderResult(result) {
  $("result").hidden = false;
  if (result.ok && result.obsidian) {
    $("result").innerHTML = `
      <div class="ok">✓ Saved</div>
      <div class="title">${escapeHtml(result.title ?? "")}</div>
      <div class="path">${escapeHtml(result.obsidian.relativePath ?? result.obsidian.path ?? "")}</div>
      ${result.oss?.uploaded ? `<div class="oss">OSS: ${escapeHtml(result.oss.url)}</div>` : ""}
    `;
  } else if (result.ok && result.skipped) {
    $("result").innerHTML = `
      <div class="warn">↷ Already in vault</div>
      <div class="path">${escapeHtml(result.existingPath ?? "")}</div>
    `;
  } else {
    const err = result.error ?? { code: "UNKNOWN", message: "unknown" };
    $("result").innerHTML = `
      <div class="bad">✗ ${escapeHtml(err.code)}</div>
      <div class="message">${escapeHtml(err.message)}</div>
    `;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

main();
```

Create `extensions/chrome/src/popup.css` (concise, system-friendly):

```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { width: 360px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 13px; padding: 12px; }
header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
h1 { font-size: 14px; margin: 0; }
button { cursor: pointer; font: inherit; }
#settings { background: transparent; border: none; font-size: 16px; }
.target { border: 1px solid rgba(127,127,127,0.3); border-radius: 6px; padding: 8px; margin-bottom: 10px; }
.target .label { font-size: 11px; opacity: 0.7; margin-bottom: 2px; }
.target .title { font-weight: 600; margin-bottom: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.target .url { font-size: 11px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.controls { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
.controls label { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.controls label.inline { justify-content: flex-start; }
select { font: inherit; padding: 3px 6px; }
.primary { width: 100%; padding: 8px; border-radius: 6px; border: 1px solid #3370ff; background: #3370ff; color: white; font-weight: 600; }
.primary:disabled { opacity: 0.6; cursor: not-allowed; }
.status { margin-top: 10px; font-size: 12px; }
.status .step { font-weight: 600; }
.status .detail { opacity: 0.7; }
.result { margin-top: 10px; padding: 8px; border-radius: 6px; border: 1px solid rgba(127,127,127,0.3); font-size: 12px; }
.result .ok { color: #17a34a; font-weight: 600; }
.result .warn { color: #c77b00; font-weight: 600; }
.result .bad { color: #d44; font-weight: 600; }
.result .path, .result .oss, .result .message { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; margin-top: 4px; }
footer { margin-top: 10px; border-top: 1px dashed rgba(127,127,127,0.3); padding-top: 6px; font-size: 11px; opacity: 0.7; }
.health.bad { color: #d44; opacity: 1; }
```

- [ ] **Step 5: options page**

Create `extensions/chrome/src/options.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>LinkProcessingAgent Settings</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <main>
      <h1>LinkProcessingAgent Settings</h1>

      <label>
        Server URL
        <input id="serverUrl" type="url" placeholder="http://127.0.0.1:8787" />
      </label>
      <p class="hint" id="hostHint"></p>

      <label>
        Bearer token <span class="muted">(optional, must match <code>--token</code> on the server)</span>
        <input id="token" type="password" placeholder="empty to disable auth" />
      </label>

      <label>
        Default duplicate policy
        <select id="duplicatePolicy">
          <option value="create">Create</option>
          <option value="skip">Skip if exists</option>
          <option value="update">Update existing</option>
        </select>
      </label>

      <label class="inline">
        <input id="ossEnabled" type="checkbox" />
        Mirror to OSS by default (when configured on server)
      </label>

      <div class="actions">
        <button id="save" class="primary">Save</button>
        <button id="test">Test connection</button>
      </div>

      <p id="status" class="status"></p>
    </main>

    <script type="module" src="options.js"></script>
  </body>
</html>
```

Create `extensions/chrome/src/options.js`:

```js
import { getSettings, setSettings, checkHealth } from "./api.js";

const $ = (id) => document.getElementById(id);

async function init() {
  const s = await getSettings();
  $("serverUrl").value = s.serverUrl;
  $("token").value = s.token ?? "";
  $("duplicatePolicy").value = s.duplicatePolicy;
  $("ossEnabled").checked = s.ossEnabled !== false;
  updateHostHint();

  $("serverUrl").addEventListener("input", updateHostHint);
  $("save").addEventListener("click", onSave);
  $("test").addEventListener("click", onTest);
}

function updateHostHint() {
  const raw = $("serverUrl").value;
  try {
    const u = new URL(raw);
    const isLocal = ["127.0.0.1", "::1", "localhost"].includes(u.hostname);
    $("hostHint").textContent = isLocal
      ? "Local binding. This is the recommended and safe choice."
      : "⚠ Non-loopback host. Make sure the server is trusted and protected by a token.";
    $("hostHint").className = isLocal ? "hint" : "hint warn";
  } catch {
    $("hostHint").textContent = "Enter a valid URL (e.g. http://127.0.0.1:8787).";
    $("hostHint").className = "hint warn";
  }
}

async function onSave() {
  await setSettings({
    serverUrl: $("serverUrl").value.replace(/\/+$/, ""),
    token: $("token").value,
    duplicatePolicy: $("duplicatePolicy").value,
    ossEnabled: $("ossEnabled").checked
  });
  setStatus("Saved.", "ok");
}

async function onTest() {
  setStatus("Testing...", "");
  try {
    const s = await getSettings();
    const h = await checkHealth({ ...s, serverUrl: $("serverUrl").value, token: $("token").value });
    setStatus(`Connected: ${JSON.stringify(h)}`, "ok");
  } catch (err) {
    setStatus(`Failed: ${err.message}`, "bad");
  }
}

function setStatus(text, kind) {
  $("status").textContent = text;
  $("status").className = `status ${kind}`;
}

init();
```

Create `extensions/chrome/src/options.css`:

```css
:root { color-scheme: light dark; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; max-width: 560px; margin: 0 auto; }
h1 { font-size: 20px; margin-bottom: 16px; }
label { display: block; margin-bottom: 14px; font-size: 13px; }
label.inline { display: flex; align-items: center; gap: 8px; }
input[type="url"], input[type="password"], select { display: block; width: 100%; margin-top: 4px; padding: 6px 8px; border-radius: 4px; border: 1px solid rgba(127,127,127,0.4); font: inherit; background: transparent; color: inherit; }
.muted { opacity: 0.6; font-weight: normal; }
.hint { font-size: 11px; opacity: 0.8; margin-top: 4px; }
.hint.warn { color: #c77b00; opacity: 1; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
button { padding: 6px 14px; border-radius: 4px; border: 1px solid rgba(127,127,127,0.4); background: transparent; font: inherit; cursor: pointer; }
button.primary { background: #3370ff; border-color: #3370ff; color: white; }
.status { margin-top: 12px; font-size: 12px; min-height: 1em; }
.status.ok { color: #17a34a; }
.status.bad { color: #d44; }
```

- [ ] **Step 6: README for the extension**

Create `extensions/chrome/README.md` with:

- Prerequisite: run `link-processing serve --port 8787` (optionally `--token <secret>`).
- Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → select `extensions/chrome`.
- Configure: click extension icon → ⚙ → set Server URL (default OK) and optional token.
- Shortcut: `Alt+Shift+S` saves current tab. Customize at `chrome://extensions/shortcuts`.
- Permissions rationale paragraph.

- [ ] **Step 7: Manual verification**

Start the server, load the unpacked extension, and verify:

1. Popup opens, shows current tab title + URL, "server: ok" in footer.
2. Click "Save" — progress steps appear, then final result with vault path.
3. Right-click page → "Save to Obsidian" → system notification shows result.
4. `Alt+Shift+S` saves the current tab without opening the popup.
5. Options page "Test connection" succeeds; bad URL shows a clear warning.
6. With `--token` on the server, unconfigured extension returns 401; configured one works.

- [ ] **Step 8: Commit**

```bash
git add extensions/chrome
git commit -m "feat: add chrome mv3 extension"
```

---

## Task 5: Documentation and Release

**Files:**
- Modify: `README.md`

### Steps

- [ ] **Step 1: README sections**

Add these sections after the existing "Commands" section:

- **Library API** — `import { createAgent } from "link-processing-agent"` with a short example.
- **HTTP server** — `link-processing serve`, ports, token, endpoint reference table.
- **MCP server** — `link-processing mcp` + sample `mcp.json` snippet for Kiro / Claude Desktop.
- **Chrome extension** — link to `extensions/chrome/README.md`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document library, http, mcp, and chrome entry points"
```

---

## Verification Checklist

Run these at the end:

```bash
pnpm typecheck
pnpm test
pnpm build

# 1. Library smoke
node -e "import('./dist/index.js').then(m => console.log(Object.keys(m)))"

# 2. HTTP serve smoke
node dist/cli/index.js serve --port 8787 &
sleep 1
curl -sS http://127.0.0.1:8787/v1/healthz
curl -sS -X POST http://127.0.0.1:8787/v1/route \
  -H 'content-type: application/json' \
  -d '{"url":"https://twitter.com/x/status/1"}'
kill %1

# 3. MCP smoke
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \
  | node dist/cli/index.js mcp

# 4. Chrome extension: load-unpacked, run manual flow from Task 4 Step 7.
```

---

## Rollout Notes

- The HTTP server binds `127.0.0.1` by default. Making it reachable to other devices requires the explicit `--allow-non-local` flag; document this prominently.
- For MCP, the agent keeps an OpenAI client alive for the session; ensure the parent process is supervised so restarts on config change work cleanly.
- The Chrome extension has no auto-update channel in v1. Users reload from `chrome://extensions` after pulling updates. Chrome Web Store submission is a separate track.
- Consider a follow-up plan for a Firefox port, an iOS/macOS Shortcut bundle, and a persistent job queue (currently all HTTP requests are synchronous).
