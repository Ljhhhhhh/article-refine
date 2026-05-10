# OSS Mirror Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Alibaba Cloud OSS (or any S3-compatible) object storage as a mirror target for every saved note. When the user provides OSS credentials via env or config, each successful `process` run also uploads the rendered Markdown to the configured bucket; when credentials are absent, behavior is identical to today.

**Architecture:** Keep the existing CLI-first pipeline. Introduce a thin `OssUploader` around `@aws-sdk/client-s3`, a `storage` config section, env bindings in `resolve-config.ts`, and a mirror step inside `processLink` after `saveObsidianNote`. OSS is strictly an augmentation of the local vault flow: the local `.md` is still authoritative, `.link-processing/source-index.json` stays local, and OSS failures degrade to warnings by default. `doctor` gains an OSS connectivity probe.

**Tech Stack:** TypeScript, `@aws-sdk/client-s3` v3, Commander, Zod, Vitest, `aws-sdk-client-mock` (for tests), Node fs/promises.

---

## Scope Check

This plan implements only OSS mirroring for saved notes:

- Add `storage.oss` config segment plus `OSS_*` env bindings with "env-implies-enabled" semantics.
- Add `OssUploader` (put + head) and `computeOssKey` helpers.
- Integrate a non-blocking mirror step into `processLink`.
- Extend result shapes, presenter output, `--no-oss` CLI flag, and `doctor` checks.
- Update `.env.example` and `README.md`.

This plan does **not** implement:

- OSS-only mode (`mode: only`) — requires rethinking local save and source-index; deferred.
- Multipart/streaming upload via `@aws-sdk/lib-storage` — note payloads are small.
- Syncing historical notes (`oss sync` command) — separate plan.
- Remote deduplication or multi-machine source-index sync — explicitly out of scope.

## File Structure Map

### New Files

| File | Responsibility |
|------|----------------|
| `src/storage/oss-uploader.ts` | Wrap `@aws-sdk/client-s3` with `upload()` and `head()`; raise `OSS_UPLOAD_FAILED`. |
| `src/storage/oss-key.ts` | Compute OSS object key from vault path, saved file path, and prefix. |
| `tests/storage/oss-uploader.test.ts` | Verify `PutObjectCommand` params, error mapping, and HTTPS URL shape using `aws-sdk-client-mock`. |
| `tests/storage/oss-key.test.ts` | Verify prefix trimming, trailing slash, and POSIX-style key separators. |

### Modified Files

| File | Change |
|------|--------|
| `src/errors/errors.ts` | Add `OSS_UPLOAD_FAILED` to `AppErrorCode`. |
| `src/config/schema.ts` | Add `storage.oss` section with defaults. |
| `src/config/load-config.ts` | Default config includes empty `storage.oss`. |
| `src/config/resolve-config.ts` | Map `OSS_*` env to `storage.oss`; enable when any key is present; validate required fields when enabled. |
| `src/core/process-link.ts` | Mirror saved markdown to OSS after local save; attach `oss` field to the result. |
| `src/core/doctor.ts` | Add `oss` check: skipped, pass via `HeadBucket`, or fail with reason. |
| `src/cli/commands/process.ts` | Accept `--no-oss`; forward `storage.oss` to `processLink`. |
| `src/cli/presenters/human.ts` | Render OSS line on success, warning on degraded failure. |
| `.env.example` | Document OSS env vars. |
| `README.md` | Add "OSS / S3 兼容存储" section. |
| `package.json` | Add `@aws-sdk/client-s3` and dev dep `aws-sdk-client-mock`. |

---

## Task 1: Dependencies and Error Code

**Files:**
- Modify: `package.json`
- Modify: `src/errors/errors.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
rtk pnpm add @aws-sdk/client-s3
rtk pnpm add -D aws-sdk-client-mock
```

Expected: `package.json` records `@aws-sdk/client-s3` under `dependencies` and `aws-sdk-client-mock` under `devDependencies`.

- [ ] **Step 2: Extend `AppErrorCode`**

Modify `src/errors/errors.ts`:

```ts
export type AppErrorCode =
  | "INVALID_URL"
  | "INVALID_OPTIONS"
  | "UNSUPPORTED_URL"
  | "FETCH_FAILED"
  | "CONTENT_TOO_SHORT"
  | "LLM_OUTPUT_INVALID"
  | "OBSIDIAN_CONFIG_MISSING"
  | "OBSIDIAN_WRITE_FAILED"
  | "OSS_UPLOAD_FAILED"
  | "OSS_CONFIG_INVALID"
  | "UNKNOWN_ERROR";
```

- [ ] **Step 3: Typecheck**

Run:

```bash
rtk pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/errors/errors.ts
git commit -m "chore: add aws-sdk-client-s3 and oss error codes"
```

---

## Task 2: Config Schema and Env Resolution

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/load-config.ts`
- Modify: `src/config/resolve-config.ts`
- Test: `tests/config/resolve-config.test.ts`

- [ ] **Step 1: Write failing resolution tests**

Append to `tests/config/resolve-config.test.ts`:

```ts
describe("resolveProcessConfig OSS", () => {
  test("keeps storage.oss.enabled false when no OSS env is set", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.storage.oss.enabled).toBe(false);
    }
  });

  test("enables OSS when endpoint, region, bucket, and credentials are in env", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.OSS_ENDPOINT = "https://s3.oss-cn-hangzhou.aliyuncs.com";
    process.env.OSS_REGION = "cn-hangzhou";
    process.env.OSS_BUCKET = "my-bucket";
    process.env.OSS_ACCESS_KEY_ID = "id";
    process.env.OSS_SECRET_ACCESS_KEY = "secret";
    process.env.OSS_PREFIX = "link-processing/";

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.config.storage.oss.enabled).toBe(true);
      expect(resolved.config.storage.oss.bucket).toBe("my-bucket");
      expect(resolved.config.storage.oss.prefix).toBe("link-processing/");
      expect(resolved.config.storage.oss.mode).toBe("mirror");
      expect(resolved.config.storage.oss.strict).toBe(false);
    }
  });

  test("fails with OSS_CONFIG_INVALID when OSS env is partially set", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.OSS_ENDPOINT = "https://s3.oss-cn-hangzhou.aliyuncs.com";
    process.env.OSS_BUCKET = "my-bucket";

    const resolved = await resolveProcessConfig({ configPath, cli: {} });

    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe("OSS_CONFIG_INVALID");
      expect(resolved.error.message).toMatch(/OSS_REGION|OSS_ACCESS_KEY_ID|OSS_SECRET_ACCESS_KEY/);
    }
  });
});
```

Also make sure the existing `beforeEach` unsets these keys:

```ts
delete process.env.OSS_ENDPOINT;
delete process.env.OSS_REGION;
delete process.env.OSS_BUCKET;
delete process.env.OSS_ACCESS_KEY_ID;
delete process.env.OSS_SECRET_ACCESS_KEY;
delete process.env.OSS_PREFIX;
delete process.env.OSS_FORCE_PATH_STYLE;
delete process.env.OSS_MODE;
delete process.env.OSS_STRICT;
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
rtk pnpm test tests/config/resolve-config.test.ts
```

Expected: FAIL because `storage.oss` does not exist yet.

- [ ] **Step 3: Extend schema**

Modify `src/config/schema.ts`. Add before `configSchema`:

```ts
export const ossConfigSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  prefix: z.string().default(""),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().default(false),
  mode: z.enum(["mirror", "only"]).default("mirror"),
  strict: z.boolean().default(false)
});

export const storageConfigSchema = z
  .object({
    oss: ossConfigSchema.default({
      enabled: false,
      prefix: "",
      forcePathStyle: false,
      mode: "mirror",
      strict: false
    })
  })
  .default({
    oss: {
      enabled: false,
      prefix: "",
      forcePathStyle: false,
      mode: "mirror",
      strict: false
    }
  });
```

Add to `configSchema`:

```ts
storage: storageConfigSchema
```

- [ ] **Step 4: Update default config**

Modify `src/config/load-config.ts`:

```ts
export function defaultConfig(vaultPath: string): LinkProcessingConfig {
  return {
    obsidian: { /* unchanged */ },
    processing: { /* unchanged */ },
    llm: { /* unchanged */ },
    logging: { level: "info" },
    storage: {
      oss: {
        enabled: false,
        prefix: "",
        forcePathStyle: false,
        mode: "mirror",
        strict: false
      }
    }
  };
}
```

- [ ] **Step 5: Map env to storage.oss**

Modify `src/config/resolve-config.ts`. Add a helper and extend `applyEnv`:

```ts
function readOssEnv(current: LinkProcessingConfig["storage"]["oss"]): LinkProcessingConfig["storage"]["oss"] {
  const any =
    process.env.OSS_ENDPOINT ||
    process.env.OSS_REGION ||
    process.env.OSS_BUCKET ||
    process.env.OSS_ACCESS_KEY_ID ||
    process.env.OSS_SECRET_ACCESS_KEY ||
    process.env.OSS_PREFIX ||
    process.env.OSS_FORCE_PATH_STYLE ||
    process.env.OSS_MODE ||
    process.env.OSS_STRICT;

  if (!any) return current;

  return {
    ...current,
    enabled: true,
    endpoint: process.env.OSS_ENDPOINT ?? current.endpoint,
    region: process.env.OSS_REGION ?? current.region,
    bucket: process.env.OSS_BUCKET ?? current.bucket,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID ?? current.accessKeyId,
    secretAccessKey: process.env.OSS_SECRET_ACCESS_KEY ?? current.secretAccessKey,
    prefix: process.env.OSS_PREFIX ?? current.prefix,
    forcePathStyle:
      process.env.OSS_FORCE_PATH_STYLE != null
        ? process.env.OSS_FORCE_PATH_STYLE === "true"
        : current.forcePathStyle,
    mode:
      process.env.OSS_MODE === "only" || process.env.OSS_MODE === "mirror"
        ? process.env.OSS_MODE
        : current.mode,
    strict:
      process.env.OSS_STRICT != null ? process.env.OSS_STRICT === "true" : current.strict
  };
}
```

In `applyEnv`, include:

```ts
storage: {
  ...config.storage,
  oss: readOssEnv(config.storage.oss)
}
```

At the end of `resolveProcessConfig` (after computing `config`), add validation:

```ts
if (config.storage.oss.enabled) {
  const missing: string[] = [];
  if (!config.storage.oss.endpoint) missing.push("OSS_ENDPOINT");
  if (!config.storage.oss.region) missing.push("OSS_REGION");
  if (!config.storage.oss.bucket) missing.push("OSS_BUCKET");
  if (!config.storage.oss.accessKeyId) missing.push("OSS_ACCESS_KEY_ID");
  if (!config.storage.oss.secretAccessKey) missing.push("OSS_SECRET_ACCESS_KEY");
  if (missing.length > 0) {
    throw new AppError(
      "OSS_CONFIG_INVALID",
      `OSS is enabled but required fields are missing: ${missing.join(", ")}.`
    );
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm test tests/config/resolve-config.test.ts
rtk pnpm typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/config/schema.ts src/config/load-config.ts src/config/resolve-config.ts tests/config/resolve-config.test.ts
git commit -m "feat: resolve oss storage config from env"
```

---

## Task 3: OssUploader and Key Helper

**Files:**
- Create: `src/storage/oss-key.ts`
- Create: `src/storage/oss-uploader.ts`
- Test: `tests/storage/oss-key.test.ts`
- Test: `tests/storage/oss-uploader.test.ts`

- [ ] **Step 1: Write failing key tests**

Create `tests/storage/oss-key.test.ts`:

```ts
import path from "node:path";
import { describe, expect, test } from "vitest";
import { computeOssKey } from "../../src/storage/oss-key.js";

describe("computeOssKey", () => {
  test("returns POSIX relative path with no prefix", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: "/tmp/vault/文章摘要/综合/2026-05-09-a.md",
      prefix: ""
    });
    expect(key).toBe("文章摘要/综合/2026-05-09-a.md");
  });

  test("joins prefix and trims leading and trailing slashes", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: "/tmp/vault/文章摘要/综合/2026-05-09-a.md",
      prefix: "/link-processing/"
    });
    expect(key).toBe("link-processing/文章摘要/综合/2026-05-09-a.md");
  });

  test("handles nested prefix segments", () => {
    const key = computeOssKey({
      vaultPath: "/tmp/vault",
      savedPath: path.join("/tmp/vault", "文章摘要", "综合", "a.md"),
      prefix: "notes/obsidian"
    });
    expect(key).toBe("notes/obsidian/文章摘要/综合/a.md");
  });
});
```

- [ ] **Step 2: Write failing uploader tests**

Create `tests/storage/oss-uploader.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { OssUploader } from "../../src/storage/oss-uploader.js";
import { AppError } from "../../src/errors/errors.js";

const s3Mock = mockClient(S3Client);

const baseConfig = {
  endpoint: "https://s3.oss-cn-hangzhou.aliyuncs.com",
  region: "cn-hangzhou",
  bucket: "my-bucket",
  prefix: "",
  accessKeyId: "id",
  secretAccessKey: "secret",
  forcePathStyle: false
};

beforeEach(() => {
  s3Mock.reset();
});

afterEach(() => {
  s3Mock.reset();
});

describe("OssUploader", () => {
  test("uploads with correct bucket, key, and content-type", async () => {
    s3Mock.on(PutObjectCommand).resolves({ ETag: "\"abc123\"" });
    const uploader = new OssUploader(baseConfig);

    const result = await uploader.upload({
      key: "文章摘要/综合/a.md",
      body: "# hello"
    });

    expect(result.bucket).toBe("my-bucket");
    expect(result.key).toBe("文章摘要/综合/a.md");
    expect(result.url).toBe("oss://my-bucket/文章摘要/综合/a.md");
    expect(result.httpsUrl).toContain("my-bucket");
    expect(result.etag).toBe("\"abc123\"");

    const call = s3Mock.commandCalls(PutObjectCommand)[0];
    expect(call.args[0].input.ContentType).toBe("text/markdown; charset=utf-8");
  });

  test("raises OSS_UPLOAD_FAILED on SDK error", async () => {
    s3Mock.on(PutObjectCommand).rejects(new Error("network down"));
    const uploader = new OssUploader(baseConfig);

    await expect(
      uploader.upload({ key: "a.md", body: "hi" })
    ).rejects.toMatchObject({ code: "OSS_UPLOAD_FAILED" });
  });

  test("head resolves when bucket reachable", async () => {
    s3Mock.on(HeadBucketCommand).resolves({});
    const uploader = new OssUploader(baseConfig);

    await expect(uploader.head()).resolves.toBeUndefined();
  });

  test("head maps failure into AppError", async () => {
    s3Mock.on(HeadBucketCommand).rejects(new Error("403 forbidden"));
    const uploader = new OssUploader(baseConfig);

    await expect(uploader.head()).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
rtk pnpm test tests/storage/oss-key.test.ts tests/storage/oss-uploader.test.ts
```

Expected: FAIL because neither source file exists yet.

- [ ] **Step 4: Implement key helper**

Create `src/storage/oss-key.ts`:

```ts
import path from "node:path";

export function computeOssKey(input: {
  vaultPath: string;
  savedPath: string;
  prefix: string;
}): string {
  const relative = path.relative(input.vaultPath, input.savedPath);
  const posix = relative.split(path.sep).filter(Boolean).join("/");
  const prefix = input.prefix.replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${posix}` : posix;
}
```

- [ ] **Step 5: Implement uploader**

Create `src/storage/oss-uploader.ts`:

```ts
import {
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { AppError } from "../errors/errors.js";

export type OssUploaderConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type OssUploadResult = {
  bucket: string;
  key: string;
  url: string;
  httpsUrl: string;
  etag?: string;
};

function buildHttpsUrl(config: OssUploaderConfig, key: string): string {
  const endpoint = config.endpoint.replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  if (config.forcePathStyle) {
    return `${endpoint}/${config.bucket}/${encodedKey}`;
  }
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${config.bucket}.${parsed.host}/${encodedKey}`;
  } catch {
    return `${endpoint}/${config.bucket}/${encodedKey}`;
  }
}

export class OssUploader {
  private readonly client: S3Client;

  constructor(private readonly config: OssUploaderConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey
      }
    });
  }

  async upload(input: {
    key: string;
    body: string | Uint8Array;
    contentType?: string;
  }): Promise<OssUploadResult> {
    try {
      const response = await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType ?? "text/markdown; charset=utf-8"
        })
      );
      return {
        bucket: this.config.bucket,
        key: input.key,
        url: `oss://${this.config.bucket}/${input.key}`,
        httpsUrl: buildHttpsUrl(this.config, input.key),
        etag: response.ETag
      };
    } catch (error) {
      throw new AppError(
        "OSS_UPLOAD_FAILED",
        error instanceof Error ? error.message : "OSS upload failed."
      );
    }
  }

  async head(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch (error) {
      throw new AppError(
        "OSS_UPLOAD_FAILED",
        error instanceof Error ? error.message : "OSS bucket not reachable."
      );
    }
  }
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm test tests/storage/oss-key.test.ts tests/storage/oss-uploader.test.ts
rtk pnpm typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/storage/oss-key.ts src/storage/oss-uploader.ts tests/storage/oss-key.test.ts tests/storage/oss-uploader.test.ts
git commit -m "feat: add oss uploader and key helper"
```

---

## Task 4: Integrate Mirror into processLink

**Files:**
- Modify: `src/core/process-link.ts`
- Modify: `src/cli/commands/process.ts`
- Modify: `src/cli/presenters/human.ts`
- Test: `tests/core/process-link.test.ts`

- [ ] **Step 1: Write failing mirror tests**

Append to `tests/core/process-link.test.ts`:

```ts
import type { OssUploadResult, OssUploader } from "../../src/storage/oss-uploader.js";

function makeUploader(behavior: "ok" | "fail"): OssUploader {
  return {
    upload: async ({ key }): Promise<OssUploadResult> => {
      if (behavior === "fail") {
        throw new (await import("../../src/errors/errors.js")).AppError(
          "OSS_UPLOAD_FAILED",
          "boom"
        );
      }
      return {
        bucket: "bucket",
        key,
        url: `oss://bucket/${key}`,
        httpsUrl: `https://bucket.example.com/${key}`,
        etag: "\"deadbeef\""
      };
    },
    head: async () => {}
  } as unknown as OssUploader;
}

describe("processLink OSS mirror", () => {
  test("attaches uploaded oss result on success", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("ok"),
        prefix: "notes",
        strict: false
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok && "obsidian" in result) {
      expect(result.oss).toMatchObject({
        uploaded: true,
        bucket: "bucket",
        url: expect.stringContaining("oss://bucket/notes/文章摘要")
      });
    }
  });

  test("degrades to warning when oss upload fails and strict is false", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("fail"),
        prefix: "",
        strict: false
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok && "obsidian" in result) {
      expect(result.oss).toMatchObject({
        uploaded: false,
        error: { code: "OSS_UPLOAD_FAILED" }
      });
      // Local save still succeeded.
      await expect(readFile(result.obsidian.path, "utf8")).resolves.toContain("# Agent 工程文章");
    }
  });

  test("returns failure when oss upload fails and strict is true", async () => {
    const result = await processLink("https://example.dev/agent", {
      vaultPath,
      fetchers: [fakeFetcher],
      extractor: new MockNoteExtractor(),
      qualityThreshold: 300,
      now: () => new Date("2026-05-07T10:00:00.000Z"),
      oss: {
        uploader: makeUploader("fail"),
        prefix: "",
        strict: true
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("OSS_UPLOAD_FAILED");
    }
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/core/process-link.test.ts
```

Expected: FAIL because `processLink` does not accept an `oss` option yet.

- [ ] **Step 3: Extend ProcessResult and ProcessOptions**

Modify `src/core/process-link.ts`:

```ts
import { computeOssKey } from "../storage/oss-key.js";
import type { OssUploader, OssUploadResult } from "../storage/oss-uploader.js";

export type ProcessOssResult =
  | {
      uploaded: true;
      bucket: string;
      key: string;
      url: string;
      httpsUrl: string;
      etag?: string;
    }
  | {
      uploaded: false;
      error: { code: "OSS_UPLOAD_FAILED"; message: string };
    };

export type ProcessSuccessResult = {
  ok: true;
  command: "process";
  sourceUrl: string;
  linkType: LinkType;
  contentType: ContentType;
  title: string;
  obsidian: SavedNote;
  oss?: ProcessOssResult;
};

export type ProcessOptions = {
  vaultPath: string;
  fetchers: ContentFetcher[];
  extractor: NoteExtractor;
  qualityThreshold: number;
  now?: () => Date;
  onProgress?: (step: string) => void;
  duplicatePolicy?: DuplicatePolicy;
  oss?: {
    uploader: OssUploader;
    prefix: string;
    strict: boolean;
  };
};
```

Add the mirror step between the local save and the source-index update:

```ts
const obsidian = await saveObsidianNote({ ... });

let ossOutcome: ProcessOssResult | undefined;
if (options.oss) {
  options.onProgress?.("mirroring");
  const key = computeOssKey({
    vaultPath: options.vaultPath,
    savedPath: obsidian.path,
    prefix: options.oss.prefix
  });
  try {
    const uploaded: OssUploadResult = await options.oss.uploader.upload({
      key,
      body: markdown
    });
    ossOutcome = {
      uploaded: true,
      bucket: uploaded.bucket,
      key: uploaded.key,
      url: uploaded.url,
      httpsUrl: uploaded.httpsUrl,
      etag: uploaded.etag
    };
  } catch (error) {
    if (options.oss.strict) {
      throw error;
    }
    const err = error instanceof AppError
      ? error
      : new AppError("OSS_UPLOAD_FAILED", error instanceof Error ? error.message : "OSS upload failed.");
    ossOutcome = {
      uploaded: false,
      error: { code: "OSS_UPLOAD_FAILED", message: err.message }
    };
  }
}

await upsertSourceIndexEntry(options.vaultPath, {
  sourceUrl,
  path: obsidian.path,
  title: note.title,
  contentType: note.contentType,
  updatedAt: now().toISOString()
});

return {
  ok: true,
  command: "process",
  sourceUrl,
  linkType: routed.linkType,
  contentType: note.contentType,
  title: note.title,
  obsidian,
  ...(ossOutcome ? { oss: ossOutcome } : {})
};
```

- [ ] **Step 4: Wire CLI**

Modify `src/cli/commands/process.ts`. Add option:

```ts
.option("--no-oss", "disable OSS mirror for this run even if configured")
```

Update the action option type with `oss?: boolean`.

After resolving config, before calling `processLink`, build the uploader when enabled:

```ts
import { OssUploader } from "../../storage/oss-uploader.js";

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
```

And pass `oss` into `processLink({...})`.

Also extend the `onProgress` label map so human mode can report it:

```ts
mirroring: "同步到 OSS...",
```

- [ ] **Step 5: Update human presenter**

Modify `src/cli/presenters/human.ts`. In the success branch, append after the existing lines:

```ts
const lines = [
  "Link processed and saved",
  "",
  `Title: ${result.title}`,
  `Type: ${result.contentType}`,
  `Saved: ${result.obsidian.path}`,
  `Tags: ${result.obsidian.tags.join(" ")}`
];

if (result.oss) {
  if (result.oss.uploaded) {
    lines.push(`OSS: ${result.oss.url}`);
  } else {
    lines.push(`OSS: upload failed (${result.oss.error.code}: ${result.oss.error.message})`);
  }
}
lines.push("");
return lines.join("\n");
```

- [ ] **Step 6: Run tests**

Run:

```bash
rtk pnpm test tests/core/process-link.test.ts tests/cli/presenters.test.ts tests/cli/process-command.test.ts
rtk pnpm typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 7: Commit**

```bash
git add src/core/process-link.ts src/cli/commands/process.ts src/cli/presenters/human.ts tests/core/process-link.test.ts
git commit -m "feat: mirror saved notes to oss"
```

---

## Task 5: Doctor OSS Check

**Files:**
- Modify: `src/core/doctor.ts`
- Test: `tests/core/doctor.test.ts`

- [ ] **Step 1: Write failing doctor tests**

Append to `tests/core/doctor.test.ts`:

```ts
describe("runDoctor OSS", () => {
  test("skips OSS check when OSS is not enabled", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await runDoctor({ configPath });

    const ossCheck = result.checks.find((check) => check.id === "oss");
    expect(ossCheck?.status).toBe("warn");
    expect(ossCheck?.message).toMatch(/not configured/i);
  });

  test("fails OSS check when head bucket rejects", async () => {
    const { mockClient } = await import("aws-sdk-client-mock");
    const { HeadBucketCommand, S3Client } = await import("@aws-sdk/client-s3");
    const s3Mock = mockClient(S3Client);
    s3Mock.on(HeadBucketCommand).rejects(new Error("403 forbidden"));

    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);
    process.env.OSS_ENDPOINT = "https://s3.oss-cn-hangzhou.aliyuncs.com";
    process.env.OSS_REGION = "cn-hangzhou";
    process.env.OSS_BUCKET = "my-bucket";
    process.env.OSS_ACCESS_KEY_ID = "id";
    process.env.OSS_SECRET_ACCESS_KEY = "secret";

    const result = await runDoctor({ configPath });

    s3Mock.reset();
    const ossCheck = result.checks.find((check) => check.id === "oss");
    expect(ossCheck?.status).toBe("fail");
    expect(result.ok).toBe(false);
  });
});
```

Also ensure the doctor test `beforeEach` clears the OSS env keys.

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk pnpm test tests/core/doctor.test.ts
```

Expected: FAIL because `oss` check does not exist yet.

- [ ] **Step 3: Implement doctor OSS check**

Modify `src/core/doctor.ts`:

```ts
import { OssUploader } from "../storage/oss-uploader.js";
```

After the LLM API key check block, add:

```ts
const oss = resolved.config.storage.oss;
if (!oss.enabled) {
  checks.push({
    id: "oss",
    label: "OSS mirror",
    status: "warn",
    message: "OSS mirror is not configured; notes are saved locally only."
  });
} else if (
  !oss.endpoint ||
  !oss.region ||
  !oss.bucket ||
  !oss.accessKeyId ||
  !oss.secretAccessKey
) {
  checks.push({
    id: "oss",
    label: "OSS mirror",
    status: "fail",
    message:
      "OSS is enabled but endpoint, region, bucket, and credentials must all be provided."
  });
} else {
  try {
    const uploader = new OssUploader({
      endpoint: oss.endpoint,
      region: oss.region,
      bucket: oss.bucket,
      prefix: oss.prefix,
      accessKeyId: oss.accessKeyId,
      secretAccessKey: oss.secretAccessKey,
      forcePathStyle: oss.forcePathStyle
    });
    await uploader.head();
    checks.push({
      id: "oss",
      label: "OSS mirror",
      status: "pass",
      message: `Bucket reachable: ${oss.bucket} @ ${oss.endpoint}`
    });
  } catch (error) {
    checks.push({
      id: "oss",
      label: "OSS mirror",
      status: "fail",
      message: error instanceof Error ? error.message : "OSS head bucket failed."
    });
  }
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
rtk pnpm test tests/core/doctor.test.ts tests/cli/doctor-command.test.ts
rtk pnpm typecheck
```

Expected: all tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/core/doctor.ts tests/core/doctor.test.ts
git commit -m "feat: add oss doctor check"
```

---

## Task 6: Docs and `.env.example`

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Update `.env.example`**

Append:

```dotenv
# --- OSS / S3 兼容对象存储（可选）---
# 任一 OSS_* 出现即视为启用；启用后下列五项为必填。
# 阿里云 OSS 的 S3 兼容 endpoint 格式：
#   https://s3.oss-<region>.aliyuncs.com （公网）
#   https://s3.oss-<region>-internal.aliyuncs.com （VPC 内网）
# OSS_ENDPOINT=https://s3.oss-cn-hangzhou.aliyuncs.com
# OSS_REGION=cn-hangzhou
# OSS_BUCKET=your-bucket
# OSS_ACCESS_KEY_ID=
# OSS_SECRET_ACCESS_KEY=
# OSS_PREFIX=link-processing/
# OSS_FORCE_PATH_STYLE=false    # bucket 名带下划线或使用 MinIO/R2 时设为 true
# OSS_MODE=mirror               # 目前仅支持 mirror
# OSS_STRICT=false              # true 时 OSS 上传失败会让 process 失败
```

- [ ] **Step 2: Update `README.md`**

Add a new section after "Deduplication":

```md
## OSS / S3-compatible Mirror

When OSS credentials are present in the environment, each processed note is mirrored to the configured bucket after the local save. Local files remain the source of truth; the source index is local-only.

Minimum env vars:

- `OSS_ENDPOINT` (S3-compatible, e.g. `https://s3.oss-cn-hangzhou.aliyuncs.com`)
- `OSS_REGION`
- `OSS_BUCKET`
- `OSS_ACCESS_KEY_ID`
- `OSS_SECRET_ACCESS_KEY`

Optional:

- `OSS_PREFIX` - bucket path prefix
- `OSS_FORCE_PATH_STYLE` - needed for bucket names with underscores or MinIO/R2
- `OSS_STRICT` - when `true`, an upload failure fails the whole process run
- `--no-oss` on `process` - one-shot disable

OSS uploads are best-effort by default: on failure the local note is still saved and the result JSON includes `oss.uploaded=false`. Run `link-processing doctor` to verify bucket connectivity.

Works with any S3-compatible service (AWS S3, MinIO, Cloudflare R2, Tencent COS, Qiniu Kodo) by pointing `OSS_ENDPOINT` at that service.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: document oss mirror env and usage"
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

Then run smoke checks against a real bucket (optional, only if credentials are available):

```bash
rtk pnpm dev -- doctor --json
rtk pnpm dev -- process https://example.com/article --llm-provider mock --json
```

Expected:

- `doctor --json` reports `oss.status = pass` when env is set, or `warn` when not set.
- `process --json` output contains an `oss.uploaded=true` field when env is set.
- Running with `--no-oss` omits the `oss` field on success.

## Self-Review

Spec coverage:

- OSS enablement, configuration, and mirror upload are covered by Tasks 2–4.
- Doctor connectivity probe is covered by Task 5.
- Onboarding docs are covered by Task 6.

Decision log:

- Default mirror mode (`storage.oss.mode = "mirror"`); `only` is deferred.
- `source-index.json` stays local; no remote dedup.
- Uploads use `@aws-sdk/client-s3` v3 `PutObjectCommand` directly; no `lib-storage` streaming.
- OSS failures degrade to warnings unless `OSS_STRICT=true`.
- `doctor` is in Phase 1 to keep credential problems discoverable before first run.

Placeholder scan:

- No placeholder markers or empty implementation steps remain.
- Every task has concrete file paths, test commands, and expected results.

Type consistency:

- `OssUploaderConfig`, `OssUploadResult`, and `ProcessOssResult` are introduced before downstream usage.
- `AppErrorCode` extended with `OSS_UPLOAD_FAILED` and `OSS_CONFIG_INVALID` before they are thrown.
- `ProcessOptions.oss` accepts any `OssUploader` shape, enabling test doubles.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-05-09-oss-mirror-storage.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
