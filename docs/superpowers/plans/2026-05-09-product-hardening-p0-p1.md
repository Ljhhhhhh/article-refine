# Product Hardening P0 P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current CLI MVP into a trustworthy first-run product by fixing config resolution, provider truthfulness, capability boundaries, Obsidian note value, source deduplication, and onboarding.

**Architecture:** Keep the existing CLI-first structure. Add small focused modules for config resolution, capability metadata, source indexing, and doctor checks. Preserve deterministic code for routing, saving, and idempotency; keep LLM behavior behind the existing extractor interface.

**Tech Stack:** TypeScript, Commander, Zod, YAML, Vitest, Node fs/promises, Node crypto, existing OpenAI-compatible extractor.

---

## Scope Check

This plan implements these review items only:

- P0.1: Fix first-use flow so `config init/check` and `process` use the same configuration chain.
- P0.2: Fix LLM provider mismatch in `.env.example` and prevent unsupported provider values from silently falling back to mock output.
- P0.3: Mark the real support boundary through a capability matrix used by CLI output and docs.
- P1.2: Increase Obsidian value through frontmatter and richer metadata.
- P1.3: Add source URL deduplication and idempotent processing options.
- P1.4: Add README quickstart and a `doctor` command.

This plan does not implement the `inspect` preflight upgrade. That was P0.4 in the earlier review, and it should be a separate plan because it touches preview UX, fetch diagnostics, and possibly lightweight classification.

## File Structure Map

### New Files

| File | Responsibility |
|------|----------------|
| `src/config/resolve-config.ts` | Resolve effective config from defaults, config file, env vars, and CLI overrides. |
| `tests/config/resolve-config.test.ts` | Verify config precedence and missing-config behavior. |
| `tests/llm/factory.test.ts` | Verify provider normalization, `openai` compatibility alias, and unsupported provider errors. |
| `src/router/capabilities.ts` | Central capability matrix for each `LinkType`. |
| `tests/router/capabilities.test.ts` | Verify support status and processability per link type. |
| `src/storage/source-index.ts` | Maintain source URL index under the Obsidian vault. |
| `tests/storage/source-index.test.ts` | Verify source URL hashing, lookup, and atomic index writes. |
| `src/core/doctor.ts` | Run environment, config, vault, provider, and capability checks. |
| `src/cli/commands/doctor.ts` | Expose `link-processing doctor` in human and JSON modes. |
| `tests/core/doctor.test.ts` | Verify doctor check results. |
| `tests/cli/doctor-command.test.ts` | Verify doctor command output and exit code. |
| `README.md` | First-run quickstart, provider setup, capability matrix, command examples. |

### Modified Files

| File | Change |
|------|--------|
| `src/config/schema.ts` | Normalize provider values and support `openai` as a compatibility alias for `draft-revise`. |
| `src/config/load-config.ts` | Export `DEFAULT_CONFIG_PATH` and keep default config aligned with real provider names. |
| `src/llm/factory.ts` | Reject unsupported providers instead of falling back to mock. |
| `.env.example` | Replace incorrect `openai` provider example with `draft-revise`; document `mock`. |
| `src/core/route-link.ts` | Add capability metadata to route results. |
| `tests/router/link-router.test.ts` | Keep route behavior green after capability additions. |
| `tests/cli/route-command.test.ts` | Assert route JSON includes capability metadata. |
| `src/templates/standard-template.ts` | Add YAML frontmatter while preserving readable Markdown body. |
| `tests/templates/standard-template.test.ts` | Assert frontmatter metadata and tag formatting. |
| `src/storage/obsidian-storage.ts` | Support update writes to an existing note path. |
| `src/core/process-link.ts` | Add duplicate policy handling and source index updates. |
| `src/cli/commands/process.ts` | Use resolved config; add `--config`, `--skip-existing`, and `--update-existing`. |
| `src/cli/index.ts` | Register doctor command. |
| `src/cli/presenters/human.ts` | Render skipped and updated process results clearly. |
| `src/cli/presenters/json.ts` | No behavioral change expected; JSON remains stable through `JSON.stringify`. |

---

## Task 1: Unified Config Resolution

**Files:**
- Create: `src/config/resolve-config.ts`
- Modify: `src/config/load-config.ts`
- Modify: `src/cli/commands/process.ts`
- Test: `tests/config/resolve-config.test.ts`
- Test: `tests/cli/process-command.test.ts`

- [ ] **Step 1: Write failing config precedence tests**

Append this test file:

```ts
// tests/config/resolve-config.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeDefaultConfig } from "../../src/config/load-config.js";
import { resolveProcessConfig } from "../../src/config/resolve-config.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-resolve-config-"));
  process.env = { ...savedEnv };
  delete process.env.LINK_PROCESSING_VAULT;
  delete process.env.LINK_PROCESSING_LLM_PROVIDER;
  delete process.env.LINK_PROCESSING_LLM_MODEL;
  delete process.env.LINK_PROCESSING_DRAFT_MODEL;
  delete process.env.LINK_PROCESSING_REVISE_MODEL;
  delete process.env.OPENAI_BASE_URL;
  delete process.env.OPENAI_API_KEY;
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("resolveProcessConfig", () => {
  test("uses config file values when CLI and env do not override them", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    const vaultPath = path.join(tempDir, "vault-from-config");
    await writeDefaultConfig(configPath, vaultPath);

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.obsidian.vaultPath).toBe(vaultPath);
      expect(resolved.config.llm.provider).toBe("mock");
      expect(resolved.configPath).toBe(configPath);
    }
  });

  test("applies precedence CLI over env over config file", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, path.join(tempDir, "vault-from-config"));
    process.env.LINK_PROCESSING_VAULT = path.join(tempDir, "vault-from-env");
    process.env.LINK_PROCESSING_LLM_PROVIDER = "mock";

    const resolved = await resolveProcessConfig({
      configPath,
      cli: {
        vaultPath: path.join(tempDir, "vault-from-cli"),
        llmProvider: "draft-revise",
        llmModel: "model-from-cli",
        llmBaseUrl: "http://127.0.0.1:11435/v1"
      }
    });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.obsidian.vaultPath).toBe(path.join(tempDir, "vault-from-cli"));
      expect(resolved.config.llm.provider).toBe("draft-revise");
      expect(resolved.config.llm.model).toBe("model-from-cli");
      expect(resolved.config.llm.baseUrl).toBe("http://127.0.0.1:11435/v1");
    }
  });

  test("returns a config missing error when no vault exists anywhere", async () => {
    const configPath = path.join(tempDir, "missing.config.yaml");

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
      expect(resolved.error.message).toContain("--vault");
      expect(resolved.error.message).toContain("LINK_PROCESSING_VAULT");
      expect(resolved.error.message).toContain("link-processing.config.yaml");
    }
  });

  test("does not create or modify the config file while resolving", async () => {
    const configPath = path.join(tempDir, "missing.config.yaml");
    await resolveProcessConfig({ configPath, cli: { vaultPath: path.join(tempDir, "vault") } });

    await expect(readFile(configPath, "utf8")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/config/resolve-config.test.ts
```

Expected: FAIL because `src/config/resolve-config.ts` does not exist.

- [ ] **Step 3: Export the default config path**

Modify `src/config/load-config.ts`:

```ts
export const DEFAULT_CONFIG_PATH = "link-processing.config.yaml";
```

Place it after the imports. Keep the existing `defaultConfig`, `writeDefaultConfig`, `loadConfig`, and `checkConfig` functions.

- [ ] **Step 4: Implement config resolution**

Create `src/config/resolve-config.ts`:

```ts
import { access } from "node:fs/promises";
import { AppError, type FailureResult, toFailureResult } from "../errors/errors.js";
import { DEFAULT_CONFIG_PATH, defaultConfig, loadConfig } from "./load-config.js";
import { configSchema, type LinkProcessingConfig } from "./schema.js";

export type ProcessCliOverrides = {
  vaultPath?: string;
  llmProvider?: string;
  llmModel?: string;
  llmBaseUrl?: string;
  draftModel?: string;
  reviseModel?: string;
};

export type ResolvedProcessConfig =
  | {
      ok: true;
      config: LinkProcessingConfig;
      configPath: string;
      loadedConfigFile: boolean;
    }
  | FailureResult;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function applyEnv(config: LinkProcessingConfig): LinkProcessingConfig {
  return configSchema.parse({
    ...config,
    obsidian: {
      ...config.obsidian,
      vaultPath: process.env.LINK_PROCESSING_VAULT ?? config.obsidian.vaultPath
    },
    llm: {
      ...config.llm,
      provider: process.env.LINK_PROCESSING_LLM_PROVIDER ?? config.llm.provider,
      model: process.env.LINK_PROCESSING_LLM_MODEL ?? config.llm.model,
      draftModel: process.env.LINK_PROCESSING_DRAFT_MODEL ?? config.llm.draftModel,
      reviseModel: process.env.LINK_PROCESSING_REVISE_MODEL ?? config.llm.reviseModel,
      baseUrl: process.env.OPENAI_BASE_URL ?? config.llm.baseUrl,
      apiKey: process.env.OPENAI_API_KEY ?? config.llm.apiKey
    }
  });
}

function applyCli(config: LinkProcessingConfig, cli: ProcessCliOverrides): LinkProcessingConfig {
  return configSchema.parse({
    ...config,
    obsidian: {
      ...config.obsidian,
      vaultPath: cli.vaultPath ?? config.obsidian.vaultPath
    },
    llm: {
      ...config.llm,
      provider: cli.llmProvider ?? config.llm.provider,
      model: cli.llmModel ?? config.llm.model,
      draftModel: cli.draftModel ?? config.llm.draftModel,
      reviseModel: cli.reviseModel ?? config.llm.reviseModel,
      baseUrl: cli.llmBaseUrl ?? config.llm.baseUrl
    }
  });
}

export async function resolveProcessConfig(input: {
  configPath?: string;
  cli: ProcessCliOverrides;
}): Promise<ResolvedProcessConfig> {
  const configPath = input.configPath ?? DEFAULT_CONFIG_PATH;
  const loadedConfigFile = await fileExists(configPath);

  try {
    const base = loadedConfigFile
      ? await loadConfig(configPath)
      : defaultConfig(input.cli.vaultPath ?? process.env.LINK_PROCESSING_VAULT ?? "");

    const config = applyCli(applyEnv(base), input.cli);
    if (!config.obsidian.vaultPath) {
      throw new AppError(
        "OBSIDIAN_CONFIG_MISSING",
        `Provide --vault, LINK_PROCESSING_VAULT, or obsidian.vaultPath in ${configPath}.`
      );
    }

    return {
      ok: true,
      config,
      configPath,
      loadedConfigFile
    };
  } catch (error) {
    return toFailureResult(
      "process",
      error instanceof AppError
        ? error
        : new AppError(
            "OBSIDIAN_CONFIG_MISSING",
            error instanceof Error ? error.message : "Failed to resolve process config."
          )
    );
  }
}
```

- [ ] **Step 5: Wire `process` to resolved config**

Modify `src/cli/commands/process.ts`:

```ts
import { resolveProcessConfig } from "../../config/resolve-config.js";
```

Add the option:

```ts
.option("--config <path>", "config path", "link-processing.config.yaml")
```

Update the action option type:

```ts
config?: string;
```

Replace the current `vaultPath` missing block and provider/model/base URL selection with:

```ts
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

if (!resolved.ok) {
  process.stdout.write(
    options.json
      ? renderJson(resolved)
      : `Missing configuration\n\nError: ${resolved.error.code}\nMessage: ${resolved.error.message}\n`
  );
  process.exitCode = 5;
  return;
}

const config = resolved.config;
```

Then create the extractor with:

```ts
extractor = createExtractor({
  ...config.llm,
  onProgress
});
```

And call `processLink` with:

```ts
vaultPath: config.obsidian.vaultPath,
qualityThreshold: config.processing.qualityThreshold,
```

- [ ] **Step 6: Update process command test for config file usage**

Append to `tests/cli/process-command.test.ts`:

```ts
test("uses --config file for vault path", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { writeDefaultConfig } = await import("../../src/config/load-config.js");

  const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-process-cli-"));
  const configPath = path.join(tempDir, "link-processing.config.yaml");
  await writeDefaultConfig(configPath, tempDir);

  const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  const program = createProgram();
  program.exitOverride();

  await program.parseAsync(
    [
      "node",
      "link-processing",
      "process",
      "https://example.dev/agent",
      "--json",
      "--config",
      configPath,
      "--llm-provider",
      "mock"
    ],
    { from: "node" }
  );

  const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
  writeSpy.mockRestore();
  await rm(tempDir, { recursive: true, force: true });

  const parsed = JSON.parse(output);
  expect(parsed.error?.code).not.toBe("OBSIDIAN_CONFIG_MISSING");
});
```

This test may still fail with `FETCH_FAILED` because it uses a real fetcher. That is acceptable for this test; the assertion is specifically about config resolution.

- [ ] **Step 7: Run tests**

Run:

```bash
rtk pnpm test tests/config/resolve-config.test.ts tests/cli/process-command.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/resolve-config.ts src/config/load-config.ts src/cli/commands/process.ts tests/config/resolve-config.test.ts tests/cli/process-command.test.ts
git commit -m "feat: resolve process config from file env and cli"
```

---

## Task 2: Provider Truthfulness and `.env.example`

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/llm/factory.ts`
- Modify: `.env.example`
- Test: `tests/llm/factory.test.ts`
- Test: `tests/config/config-command.test.ts`

- [ ] **Step 1: Write failing provider tests**

Create `tests/llm/factory.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createExtractor } from "../../src/llm/factory.js";
import { DraftReviseExtractor } from "../../src/llm/draft-revise-extractor.js";
import { MockNoteExtractor } from "../../src/llm/note-extractor.js";

describe("createExtractor", () => {
  test("creates mock extractor for mock provider", () => {
    const extractor = createExtractor({
      provider: "mock",
      model: "mock",
      longContentThreshold: 32000
    });

    expect(extractor).toBeInstanceOf(MockNoteExtractor);
  });

  test("treats openai as a compatibility alias for draft-revise", () => {
    const extractor = createExtractor({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "test-key",
      longContentThreshold: 32000
    });

    expect(extractor).toBeInstanceOf(DraftReviseExtractor);
  });

  test("throws for unsupported provider instead of silently returning mock", () => {
    expect(() =>
      createExtractor({
        provider: "unsupported-provider",
        model: "gpt-4o",
        apiKey: "test-key",
        longContentThreshold: 32000
      })
    ).toThrow("Unsupported LLM provider");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/llm/factory.test.ts
```

Expected: FAIL because `openai` is not accepted by the current type and unsupported providers fall back to mock.

- [ ] **Step 3: Normalize provider schema**

Modify `src/config/schema.ts` to include these definitions above `configSchema`:

```ts
export const normalizedLlmProviderSchema = z
  .enum(["mock", "draft-revise", "two-step", "openai"])
  .transform((provider): "mock" | "draft-revise" | "two-step" =>
    provider === "openai" ? "draft-revise" : provider
  );
```

Replace the current provider field:

```ts
provider: z.enum(["mock", "draft-revise", "two-step"]).default("draft-revise"),
```

with:

```ts
provider: normalizedLlmProviderSchema.default("draft-revise"),
```

- [ ] **Step 4: Make factory explicit**

Modify `src/llm/factory.ts`:

```ts
export type RawLlmProvider = "mock" | "draft-revise" | "two-step" | "openai" | string;

function normalizeProvider(provider: RawLlmProvider): "mock" | "draft-revise" | "two-step" {
  if (provider === "openai") return "draft-revise";
  if (provider === "mock" || provider === "draft-revise" || provider === "two-step") {
    return provider;
  }
  throw new Error(
    `Unsupported LLM provider "${provider}". Supported providers: mock, draft-revise, two-step.`
  );
}
```

Then change the provider assignment:

```ts
const provider = normalizeProvider(llmConfig.provider);
```

And replace the final fallback:

```ts
return new MockNoteExtractor();
```

with:

```ts
if (provider === "mock") {
  return new MockNoteExtractor();
}

throw new Error(`Unsupported LLM provider "${provider}".`);
```

- [ ] **Step 5: Update `.env.example`**

Replace the LLM section in `.env.example` with:

```bash
# LLM Provider: draft-revise | two-step | mock
# draft-revise is the default production path.
# mock is only for local smoke tests and does not call an LLM.
LINK_PROCESSING_LLM_PROVIDER=draft-revise
LINK_PROCESSING_LLM_MODEL=Qwen3.5-4B-OptiQ-4bit

# Optional: split models for the two passes.
# LINK_PROCESSING_DRAFT_MODEL=Qwen3.5-4B-OptiQ-4bit
# LINK_PROCESSING_REVISE_MODEL=Qwen3.5-4B-OptiQ-4bit
```

Keep the existing vault, proxy, API key, and base URL sections.

- [ ] **Step 6: Update config test to assert real provider names**

Append to `tests/config/config-command.test.ts`:

```ts
test("normalizes openai provider alias to draft-revise", async () => {
  const configPath = path.join(tempDir, "link-processing.config.yaml");
  await writeDefaultConfig(configPath, tempDir);
  const raw = await readFile(configPath, "utf8");
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(configPath, raw.replace("provider: mock", "provider: openai"), "utf8")
  );

  const result = await checkConfig(configPath);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.config.llm.provider).toBe("draft-revise");
  }
});
```

- [ ] **Step 7: Run tests**

Run:

```bash
rtk pnpm test tests/llm/factory.test.ts tests/config/config-command.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 8: Commit**

```bash
git add src/config/schema.ts src/llm/factory.ts .env.example tests/llm/factory.test.ts tests/config/config-command.test.ts
git commit -m "fix: make llm provider configuration truthful"
```

---

## Task 3: Capability Matrix and Honest Support Boundaries

**Files:**
- Create: `src/router/capabilities.ts`
- Modify: `src/core/route-link.ts`
- Test: `tests/router/capabilities.test.ts`
- Test: `tests/cli/route-command.test.ts`

- [ ] **Step 1: Write capability tests**

Create `tests/router/capabilities.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { getLinkCapability } from "../../src/router/capabilities.js";

describe("getLinkCapability", () => {
  test("marks Twitter and technical blogs as processable", () => {
    expect(getLinkCapability("twitter")).toMatchObject({
      status: "stable",
      canProcess: true
    });
    expect(getLinkCapability("tech_blog")).toMatchObject({
      status: "stable",
      canProcess: true
    });
  });

  test("marks video as route-only until metadata fetcher exists", () => {
    expect(getLinkCapability("video")).toMatchObject({
      status: "route_only",
      canProcess: false
    });
  });

  test("marks academic as beta because PDF extraction is not implemented", () => {
    expect(getLinkCapability("academic")).toMatchObject({
      status: "beta",
      canProcess: true
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/router/capabilities.test.ts
```

Expected: FAIL because `src/router/capabilities.ts` does not exist.

- [ ] **Step 3: Implement capability metadata**

Create `src/router/capabilities.ts`:

```ts
import type { LinkType } from "./types.js";

export type CapabilityStatus = "stable" | "beta" | "route_only";

export type LinkCapability = {
  status: CapabilityStatus;
  canProcess: boolean;
  canInspect: boolean;
  label: string;
  notes: string[];
};

const CAPABILITIES: Record<LinkType, LinkCapability> = {
  twitter: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Twitter/X article or tweet",
    notes: ["Uses api.fxtwitter.com JSON parsing with web fetch fallback."]
  },
  tech_blog: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Technical blog",
    notes: ["Uses HTTP fetch, Readability extraction, and Markdown conversion."]
  },
  general: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "General web article",
    notes: ["Best for article-like HTML pages with readable main content."]
  },
  docs: {
    status: "stable",
    canProcess: true,
    canInspect: true,
    label: "Product or developer docs",
    notes: ["Works for static documentation pages; multi-page crawling is not included."]
  },
  weixin: {
    status: "beta",
    canProcess: true,
    canInspect: true,
    label: "WeChat public account article",
    notes: ["HTTP extraction may work; Playwright JavaScript fallback is not implemented."]
  },
  academic: {
    status: "beta",
    canProcess: true,
    canInspect: true,
    label: "Academic abstract or paper page",
    notes: ["HTML pages may work; PDF parsing is not implemented."]
  },
  video: {
    status: "route_only",
    canProcess: false,
    canInspect: false,
    label: "Video URL",
    notes: ["Video metadata and transcript extraction are not implemented."]
  }
};

export function getLinkCapability(linkType: LinkType): LinkCapability {
  return CAPABILITIES[linkType];
}

export function listLinkCapabilities(): Record<LinkType, LinkCapability> {
  return CAPABILITIES;
}
```

- [ ] **Step 4: Add capability to route result**

Modify `src/core/route-link.ts`:

```ts
import { getLinkCapability, type LinkCapability } from "../router/capabilities.js";
```

Update `RouteSuccessResult`:

```ts
export type RouteSuccessResult = RoutedLink & {
  ok: true;
  command: "route";
  capability: LinkCapability;
};
```

Update the success return:

```ts
return {
  ok: true,
  command: "route",
  ...routed,
  capability: getLinkCapability(routed.linkType)
};
```

- [ ] **Step 5: Update route command test**

In `tests/cli/route-command.test.ts`, add this expectation inside `toMatchObject`:

```ts
capability: {
  status: "stable",
  canProcess: true,
  canInspect: true
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm test tests/router/capabilities.test.ts tests/cli/route-command.test.ts tests/router/link-router.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/router/capabilities.ts src/core/route-link.ts tests/router/capabilities.test.ts tests/cli/route-command.test.ts
git commit -m "feat: expose link type capability matrix"
```

---

## Task 4: Obsidian Frontmatter and Metadata Value

**Files:**
- Modify: `src/templates/standard-template.ts`
- Test: `tests/templates/standard-template.test.ts`

- [ ] **Step 1: Write failing frontmatter test**

Append to `tests/templates/standard-template.test.ts`:

```ts
test("renders YAML frontmatter for Obsidian metadata", () => {
  const markdown = renderStandardTemplate({
    note: {
      title: "RSC 性能优化实践",
      contentType: "技术深度",
      tags: ["#React", "#RSC", "#性能优化"],
      knowledgeConnections: ["Next.js App Router"],
      body: "## 背景\n\n正文"
    },
    sourceUrl: "https://example.com/rsc",
    author: "Example Author",
    createdAt: new Date("2026-05-09T00:00:00.000Z"),
    fetchedAt: new Date("2026-05-09T10:20:00.000Z")
  });

  expect(markdown.startsWith("---\n")).toBe(true);
  expect(markdown).toContain('title: "RSC 性能优化实践"');
  expect(markdown).toContain("source_url: https://example.com/rsc");
  expect(markdown).toContain("content_type: 技术深度");
  expect(markdown).toContain("created: 2026-05-09");
  expect(markdown).toContain("fetched: 2026-05-09 10:20");
  expect(markdown).toContain("- React");
  expect(markdown).toContain("- RSC");
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/templates/standard-template.test.ts
```

Expected: FAIL because current template does not emit YAML frontmatter.

- [ ] **Step 3: Implement frontmatter rendering**

Modify `src/templates/standard-template.ts`:

```ts
import YAML from "yaml";
import type { ProcessedNote } from "../llm/schema.js";
```

Add helpers:

```ts
function stripHash(tag: string): string {
  return tag.replace(/^#/, "");
}

function renderFrontmatter(input: RenderStandardTemplateInput): string {
  const { note, sourceUrl, author, createdAt, fetchedAt } = input;
  const yaml = YAML.stringify({
    title: note.title,
    source_url: sourceUrl,
    author: author ?? "未知",
    content_type: note.contentType,
    created: formatDate(createdAt),
    fetched: formatDateTime(fetchedAt),
    tags: note.tags.map(stripHash)
  });

  return ["---", yaml.trimEnd(), "---", ""].join("\n");
}
```

Then prepend it to `renderStandardTemplate`:

```ts
const lines: string[] = [
  renderFrontmatter(input),
  `# ${note.title}`,
  "",
  `> 创建日期：${formatDate(createdAt)}`,
  `> 来源：${sourceUrl}`,
  `> 作者：${author ?? "未知"}`,
  `> 抓取时间：${formatDateTime(fetchedAt)}`,
  `> 标签：${note.tags.join(" ")}`,
  "",
  "---",
  "",
  note.body.trim(),
  "",
  "---",
  ""
];
```

- [ ] **Step 4: Run tests**

Run:

```bash
rtk pnpm test tests/templates/standard-template.test.ts tests/core/process-link.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
git add src/templates/standard-template.ts tests/templates/standard-template.test.ts
git commit -m "feat: add obsidian frontmatter metadata"
```

---

## Task 5: Source URL Deduplication and Idempotency

**Files:**
- Create: `src/storage/source-index.ts`
- Modify: `src/storage/obsidian-storage.ts`
- Modify: `src/core/process-link.ts`
- Modify: `src/cli/commands/process.ts`
- Modify: `src/cli/presenters/human.ts`
- Test: `tests/storage/source-index.test.ts`
- Test: `tests/core/process-link.test.ts`
- Test: `tests/cli/process-command.test.ts`

- [ ] **Step 1: Write source index tests**

Create `tests/storage/source-index.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  findSourceIndexEntry,
  normalizeSourceUrl,
  sourceUrlHash,
  upsertSourceIndexEntry
} from "../../src/storage/source-index.js";

let vaultPath: string;

beforeEach(async () => {
  vaultPath = await mkdtemp(path.join(os.tmpdir(), "link-processing-source-index-"));
});

afterEach(async () => {
  await rm(vaultPath, { recursive: true, force: true });
});

describe("source index", () => {
  test("normalizes source URLs by removing hash fragments", () => {
    expect(normalizeSourceUrl("https://example.com/a?x=1#section")).toBe(
      "https://example.com/a?x=1"
    );
  });

  test("uses a stable short hash for a source URL", () => {
    expect(sourceUrlHash("https://example.com/a")).toBe(sourceUrlHash("https://example.com/a"));
    expect(sourceUrlHash("https://example.com/a")).toHaveLength(16);
  });

  test("upserts and finds an entry", async () => {
    await upsertSourceIndexEntry(vaultPath, {
      sourceUrl: "https://example.com/a",
      path: "/vault/文章摘要/综合/2026-05-09-a.md",
      title: "A",
      contentType: "综合",
      updatedAt: "2026-05-09T00:00:00.000Z"
    });

    const found = await findSourceIndexEntry(vaultPath, "https://example.com/a#part");

    expect(found?.title).toBe("A");
    expect(found?.urlHash).toBe(sourceUrlHash("https://example.com/a"));

    const raw = await readFile(path.join(vaultPath, ".link-processing", "source-index.json"), "utf8");
    expect(JSON.parse(raw).entries).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/storage/source-index.test.ts
```

Expected: FAIL because `src/storage/source-index.ts` does not exist.

- [ ] **Step 3: Implement source index**

Create `src/storage/source-index.ts`:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContentTypeDirectory } from "./file-naming.js";

export type SourceIndexEntry = {
  sourceUrl: string;
  normalizedSourceUrl: string;
  urlHash: string;
  path: string;
  title: string;
  contentType: ContentTypeDirectory;
  updatedAt: string;
};

type SourceIndexFile = {
  version: 1;
  entries: SourceIndexEntry[];
};

function indexPath(vaultPath: string): string {
  return path.join(vaultPath, ".link-processing", "source-index.json");
}

export function normalizeSourceUrl(sourceUrl: string): string {
  const parsed = new URL(sourceUrl);
  parsed.hash = "";
  return parsed.toString();
}

export function sourceUrlHash(sourceUrl: string): string {
  return createHash("sha256").update(normalizeSourceUrl(sourceUrl)).digest("hex").slice(0, 16);
}

async function readIndex(vaultPath: string): Promise<SourceIndexFile> {
  try {
    const raw = await readFile(indexPath(vaultPath), "utf8");
    const parsed = JSON.parse(raw) as SourceIndexFile;
    return { version: 1, entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { version: 1, entries: [] };
  }
}

async function writeIndex(vaultPath: string, index: SourceIndexFile): Promise<void> {
  const target = indexPath(vaultPath);
  await mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp-${Date.now()}`;
  await writeFile(temp, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await rename(temp, target);
}

export async function findSourceIndexEntry(
  vaultPath: string,
  sourceUrl: string
): Promise<SourceIndexEntry | undefined> {
  const hash = sourceUrlHash(sourceUrl);
  const index = await readIndex(vaultPath);
  return index.entries.find((entry) => entry.urlHash === hash);
}

export async function upsertSourceIndexEntry(
  vaultPath: string,
  entry: Omit<SourceIndexEntry, "normalizedSourceUrl" | "urlHash">
): Promise<SourceIndexEntry> {
  const normalizedSourceUrl = normalizeSourceUrl(entry.sourceUrl);
  const urlHash = sourceUrlHash(entry.sourceUrl);
  const nextEntry: SourceIndexEntry = {
    ...entry,
    normalizedSourceUrl,
    urlHash
  };

  const index = await readIndex(vaultPath);
  const entries = index.entries.filter((candidate) => candidate.urlHash !== urlHash);
  entries.push(nextEntry);
  await writeIndex(vaultPath, { version: 1, entries });
  return nextEntry;
}
```

- [ ] **Step 4: Extend Obsidian save for updates**

Modify `src/storage/obsidian-storage.ts` input type:

```ts
existingPath?: string;
```

Before target directory naming, add:

```ts
if (input.existingPath) {
  const tempPath = `${input.existingPath}.tmp-${Date.now()}`;
  await writeFile(tempPath, input.markdown, "utf8");
  await rename(tempPath, input.existingPath);
  return {
    saved: true,
    path: input.existingPath,
    filename: path.basename(input.existingPath),
    tags: input.tags
  };
}
```

- [ ] **Step 5: Add duplicate result types**

Modify `src/core/process-link.ts`:

```ts
import { findSourceIndexEntry, upsertSourceIndexEntry } from "../storage/source-index.js";
```

Add types:

```ts
export type DuplicatePolicy = "create" | "skip" | "update";

export type ProcessSkippedResult = {
  ok: true;
  command: "process";
  sourceUrl: string;
  skipped: true;
  reason: "SOURCE_ALREADY_EXISTS";
  existingPath: string;
};
```

Update:

```ts
export type ProcessResult = ProcessSuccessResult | ProcessSkippedResult | FailureResult;
```

Add option:

```ts
duplicatePolicy?: DuplicatePolicy;
```

After routing succeeds and before fetching:

```ts
const duplicatePolicy = options.duplicatePolicy ?? "create";
const existingEntry = await findSourceIndexEntry(options.vaultPath, sourceUrl);
if (existingEntry && duplicatePolicy === "skip") {
  return {
    ok: true,
    command: "process",
    sourceUrl,
    skipped: true,
    reason: "SOURCE_ALREADY_EXISTS",
    existingPath: existingEntry.path
  };
}
```

When saving:

```ts
const obsidian = await saveObsidianNote({
  vaultPath: options.vaultPath,
  title: note.title,
  contentType: note.contentType,
  markdown,
  tags: note.tags,
  now,
  existingPath: existingEntry && duplicatePolicy === "update" ? existingEntry.path : undefined
});
```

After save:

```ts
await upsertSourceIndexEntry(options.vaultPath, {
  sourceUrl,
  path: obsidian.path,
  title: note.title,
  contentType: note.contentType,
  updatedAt: now().toISOString()
});
```

- [ ] **Step 6: Add core duplicate tests**

Append to `tests/core/process-link.test.ts`:

```ts
test("skips existing source when duplicatePolicy is skip", async () => {
  const first = await processLink("https://example.dev/agent", {
    vaultPath,
    fetchers: [fakeFetcher],
    extractor: new MockNoteExtractor(),
    qualityThreshold: 300,
    duplicatePolicy: "create",
    now: () => new Date("2026-05-07T10:00:00.000Z")
  });

  expect(first.ok).toBe(true);

  const second = await processLink("https://example.dev/agent#section", {
    vaultPath,
    fetchers: [fakeFetcher],
    extractor: new MockNoteExtractor(),
    qualityThreshold: 300,
    duplicatePolicy: "skip",
    now: () => new Date("2026-05-07T10:00:00.000Z")
  });

  expect(second.ok).toBe(true);
  if (second.ok && "skipped" in second) {
    expect(second.skipped).toBe(true);
    expect(second.existingPath).toContain("2026-05-07-Agent 工程文章.md");
  } else {
    throw new Error("Expected skipped duplicate result.");
  }
});
```

- [ ] **Step 7: Wire CLI options**

Modify `src/cli/commands/process.ts`:

```ts
.option("--skip-existing", "skip processing if source URL already exists in the vault index")
.option("--update-existing", "overwrite the existing note if source URL already exists")
```

Add option types:

```ts
skipExisting?: boolean;
updateExisting?: boolean;
```

Before calling `processLink`:

```ts
const duplicatePolicy = options.updateExisting
  ? "update"
  : options.skipExisting
    ? "skip"
    : "create";
```

Pass:

```ts
duplicatePolicy,
```

- [ ] **Step 8: Render skipped results**

Modify `src/cli/presenters/human.ts` after the failure branch:

```ts
if ("skipped" in result && result.skipped) {
  return [
    "Link already processed",
    "",
    `Existing: ${result.existingPath}`,
    "Action: skipped",
    ""
  ].join("\n");
}
```

- [ ] **Step 9: Run tests**

Run:

```bash
rtk pnpm test tests/storage/source-index.test.ts tests/storage/obsidian-storage.test.ts tests/core/process-link.test.ts tests/cli/process-command.test.ts tests/cli/presenters.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 10: Commit**

```bash
git add src/storage/source-index.ts src/storage/obsidian-storage.ts src/core/process-link.ts src/cli/commands/process.ts src/cli/presenters/human.ts tests/storage/source-index.test.ts tests/core/process-link.test.ts tests/cli/process-command.test.ts tests/cli/presenters.test.ts
git commit -m "feat: add source url deduplication"
```

---

## Task 6: Doctor Command

**Files:**
- Create: `src/core/doctor.ts`
- Create: `src/cli/commands/doctor.ts`
- Modify: `src/cli/index.ts`
- Test: `tests/core/doctor.test.ts`
- Test: `tests/cli/doctor-command.test.ts`

- [ ] **Step 1: Write doctor core tests**

Create `tests/core/doctor.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { writeDefaultConfig } from "../../src/config/load-config.js";
import { runDoctor } from "../../src/core/doctor.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-doctor-"));
  process.env = { ...savedEnv };
});

afterEach(async () => {
  process.env = { ...savedEnv };
  await rm(tempDir, { recursive: true, force: true });
});

describe("runDoctor", () => {
  test("passes for mock provider and writable vault", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await runDoctor({ configPath });

    expect(result.ok).toBe(true);
    expect(result.checks.map((check) => check.id)).toContain("config");
    expect(result.checks.map((check) => check.id)).toContain("vault");
    expect(result.checks.map((check) => check.id)).toContain("llm-provider");
  });

  test("fails when draft-revise provider lacks api key", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.LINK_PROCESSING_LLM_PROVIDER = "draft-revise";
    delete process.env.OPENAI_API_KEY;

    const result = await runDoctor({ configPath });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: "llm-api-key",
        status: "fail"
      })
    );
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/core/doctor.test.ts
```

Expected: FAIL because `src/core/doctor.ts` does not exist.

- [ ] **Step 3: Implement doctor core**

Create `src/core/doctor.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveProcessConfig } from "../config/resolve-config.js";
import { listLinkCapabilities } from "../router/capabilities.js";

export type DoctorCheck = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  message: string;
};

export type DoctorResult = {
  ok: boolean;
  checks: DoctorCheck[];
};

export async function runDoctor(input: { configPath?: string }): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const resolved = await resolveProcessConfig({ configPath: input.configPath, cli: {} });

  if (!resolved.ok) {
    return {
      ok: false,
      checks: [
        {
          id: "config",
          label: "Configuration",
          status: "fail",
          message: resolved.error.message
        }
      ]
    };
  }

  checks.push({
    id: "config",
    label: "Configuration",
    status: resolved.loadedConfigFile ? "pass" : "warn",
    message: resolved.loadedConfigFile
      ? `Loaded ${resolved.configPath}`
      : `No config file loaded; using env and CLI defaults.`
  });

  try {
    const probeDir = path.join(resolved.config.obsidian.vaultPath, ".link-processing");
    await mkdir(probeDir, { recursive: true });
    await writeFile(path.join(probeDir, ".doctor-write-test"), "ok", "utf8");
    checks.push({
      id: "vault",
      label: "Obsidian vault",
      status: "pass",
      message: `Writable: ${resolved.config.obsidian.vaultPath}`
    });
  } catch (error) {
    checks.push({
      id: "vault",
      label: "Obsidian vault",
      status: "fail",
      message: error instanceof Error ? error.message : "Vault write check failed."
    });
  }

  checks.push({
    id: "llm-provider",
    label: "LLM provider",
    status: "pass",
    message: `Provider: ${resolved.config.llm.provider}`
  });

  if (resolved.config.llm.provider !== "mock" && !resolved.config.llm.apiKey) {
    checks.push({
      id: "llm-api-key",
      label: "LLM API key",
      status: "fail",
      message: "OPENAI_API_KEY or llm.apiKey is required for draft-revise and two-step."
    });
  } else {
    checks.push({
      id: "llm-api-key",
      label: "LLM API key",
      status: resolved.config.llm.provider === "mock" ? "warn" : "pass",
      message:
        resolved.config.llm.provider === "mock"
          ? "Mock provider does not call an LLM."
          : "API key configured."
    });
  }

  const capabilities = listLinkCapabilities();
  const processable = Object.values(capabilities).filter((capability) => capability.canProcess).length;
  checks.push({
    id: "capabilities",
    label: "Link capabilities",
    status: "pass",
    message: `${processable} link types are processable; video is route-only.`
  });

  return {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
}
```

- [ ] **Step 4: Write doctor CLI test**

Create `tests/cli/doctor-command.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/index.js";
import { writeDefaultConfig } from "../../src/config/load-config.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-doctor-cli-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("doctor command", () => {
  test("prints JSON doctor result", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(
      ["node", "link-processing", "doctor", "--json", "--config", configPath],
      { from: "node" }
    );

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    writeSpy.mockRestore();

    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "config" })])
    );
  });
});
```

- [ ] **Step 5: Implement doctor command**

Create `src/cli/commands/doctor.ts`:

```ts
import type { Command } from "commander";
import { runDoctor, type DoctorResult } from "../../core/doctor.js";
import { renderJson } from "../presenters/json.js";

function renderHumanDoctor(result: DoctorResult): string {
  const lines = [result.ok ? "Doctor checks passed" : "Doctor checks failed", ""];
  for (const check of result.checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.label}: ${check.message}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .option("--config <path>", "config path", "link-processing.config.yaml")
    .option("--json", "print machine-readable JSON")
    .action(async (options: { config: string; json?: boolean }) => {
      const result = await runDoctor({ configPath: options.config });
      process.stdout.write(options.json ? renderJson(result) : renderHumanDoctor(result));
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
```

Modify `src/cli/index.ts`:

```ts
import { registerDoctorCommand } from "./commands/doctor.js";
```

Register it after config:

```ts
registerDoctorCommand(program);
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm test tests/core/doctor.test.ts tests/cli/doctor-command.test.ts
rtk pnpm typecheck
```

Expected: all tests pass and TypeScript reports no errors.

- [ ] **Step 7: Commit**

```bash
git add src/core/doctor.ts src/cli/commands/doctor.ts src/cli/index.ts tests/core/doctor.test.ts tests/cli/doctor-command.test.ts
git commit -m "feat: add doctor command"
```

---

## Task 7: README Quickstart and Capability Documentation

**Files:**
- Create: `README.md`
- Optional modify: `docs/superpowers/specs/2026-05-07-cli-first-link-processing-agent-design.md`

- [ ] **Step 1: Create README**

Create `README.md`:

```md
# LinkProcessingAgent

CLI-first link processing for Obsidian. Give it a URL, and it fetches the content, creates a high-fidelity Markdown note, and saves it into your vault.

## Quickstart

```bash
pnpm install
pnpm build
pnpm dev -- config init --vault /path/to/obsidian-vault
pnpm dev -- doctor
pnpm dev -- process https://example.com/article --llm-provider mock
```

Use `mock` only for smoke tests. For real notes, configure an OpenAI-compatible endpoint:

```bash
cp .env.example .env
```

Then edit:

```bash
LINK_PROCESSING_LLM_PROVIDER=draft-revise
LINK_PROCESSING_LLM_MODEL=Qwen3.5-4B-OptiQ-4bit
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=http://127.0.0.1:11435/v1
```

## Commands

```bash
link-processing route <url> --json
link-processing inspect <url> --json
link-processing process <url>
link-processing process <url> --json
link-processing process <url> --skip-existing
link-processing process <url> --update-existing
link-processing config init --vault /path/to/vault
link-processing config check
link-processing doctor
```

## Config Precedence

`process` resolves configuration in this order:

1. CLI flags such as `--vault`, `--llm-provider`, and `--llm-model`
2. Environment variables such as `LINK_PROCESSING_VAULT` and `OPENAI_API_KEY`
3. `link-processing.config.yaml`
4. Built-in defaults

## Link Type Support

| Link type | Status | Process support | Notes |
|-----------|--------|-----------------|-------|
| Twitter/X | stable | yes | Uses fxtwitter JSON parsing. |
| Technical blog | stable | yes | Uses HTTP fetch, Readability, and Markdown conversion. |
| General article | stable | yes | Best for article-like HTML pages. |
| Docs | stable | yes | Static docs pages only; no crawler. |
| WeChat | beta | yes | HTTP extraction may work; Playwright fallback is not implemented. |
| Academic | beta | yes | HTML pages may work; PDF parsing is not implemented. |
| Video | route-only | no | Metadata and transcript extraction are not implemented. |

## Obsidian Output

Notes are saved under:

```text
文章摘要/<内容类型>/<YYYY-MM-DD-title>.md
```

Each note includes YAML frontmatter, readable source metadata, the generated Markdown body, knowledge connections, and the original URL.

## Deduplication

The CLI maintains a vault-local source index at:

```text
.link-processing/source-index.json
```

Use:

```bash
link-processing process <url> --skip-existing
link-processing process <url> --update-existing
```

## Troubleshooting

Run:

```bash
link-processing doctor
```

Doctor checks config loading, vault writability, provider setup, API key presence, and supported link capabilities.
```

- [ ] **Step 2: Optional spec correction**

If the current MVP spec still says all routed link types are fully supported, add a short note under its scope section:

```md
Current product support is tracked by `src/router/capabilities.ts`. The router may identify a link type before the product has complete fetching or transcript support for that type.
```

- [ ] **Step 3: Verify README command examples do not contradict CLI**

Run:

```bash
rtk rg -n "openai|draft-revise|skip-existing|update-existing|doctor|route-only" README.md .env.example src/cli
rtk pnpm typecheck
```

Expected: `README.md` and `.env.example` use `draft-revise`, and CLI source contains `doctor`, `skip-existing`, and `update-existing`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/superpowers/specs/2026-05-07-cli-first-link-processing-agent-design.md
git commit -m "docs: add quickstart and support matrix"
```

---

## Verification Before Completion

Run the full suite:

```bash
rtk pnpm test
rtk pnpm typecheck
rtk pnpm build
```

Expected:

- All Vitest tests pass.
- TypeScript reports no errors.
- Build exits `0`.

Then run smoke checks:

```bash
rtk pnpm dev -- config init --vault /private/tmp/link-processing-vault
rtk pnpm dev -- doctor --json
rtk pnpm dev -- route https://x.com/user/status/123 --json
rtk pnpm dev -- process https://example.com --vault /private/tmp/link-processing-vault --llm-provider mock --skip-existing --json
```

Expected:

- `doctor --json` returns `ok: true` for mock provider and writable vault.
- `route` includes `capability`.
- `process` writes a note on first run.
- Running the same `process` command again with `--skip-existing` returns a skipped duplicate result.

If `pnpm dev` fails because `tsx` cannot create its local IPC pipe in the sandbox, run the same smoke checks after `rtk pnpm build` with:

```bash
rtk node dist/cli/index.js doctor --json
```

## Self-Review

Spec coverage:

- P0.1 is covered by Task 1.
- P0.2 is covered by Task 2.
- P0.3 is covered by Task 3 and Task 7.
- P1.2 is covered by Task 4.
- P1.3 is covered by Task 5.
- P1.4 is covered by Task 6 and Task 7.

Placeholder scan:

- No placeholder markers or empty implementation steps remain.
- Every task has concrete file paths, test commands, and expected results.

Type consistency:

- `LinkCapability`, `DuplicatePolicy`, `SourceIndexEntry`, and `DoctorResult` are introduced before downstream usage.
- Provider names are normalized to `mock | draft-revise | two-step`; `openai` is compatibility input only.
- Duplicate results use `skipped: true`, so presenters can distinguish them without weakening existing process success shape.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-09-product-hardening-p0-p1.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
