import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/index.js";
import { writeDefaultConfig, checkConfig } from "../../src/config/load-config.js";

let tempDir: string;
const savedEnv = { ...process.env };

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-config-"));
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

describe("config helpers", () => {
  test("writes default config with Obsidian categories", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");

    await writeDefaultConfig(configPath, "/vault");

    const content = await readFile(configPath, "utf8");
    expect(content).toContain("vaultPath: /vault");
    expect(content).toContain("technology: 技术深度");
  });

  test("checks readable config", async () => {
    const configPath = path.join(tempDir, "link-processing.config.yaml");
    await writeDefaultConfig(configPath, tempDir);

    const result = await checkConfig(configPath);

    expect(result.ok).toBe(true);
  });

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
});

describe("config command", () => {
  test("check uses the same env fallback as process", async () => {
    process.env.LINK_PROCESSING_VAULT = tempDir;

    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(
      ["node", "link-processing", "config", "check", "--json", "--path", path.join(tempDir, "missing.yaml")],
      { from: "node" }
    );

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    writeSpy.mockRestore();
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.config.obsidian.vaultPath).toBe(tempDir);
  });
});
