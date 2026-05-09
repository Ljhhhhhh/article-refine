import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/index.js";

describe("process command", () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.LINK_PROCESSING_VAULT;
    delete process.env.LINK_PROCESSING_LLM_PROVIDER;
    delete process.env.LINK_PROCESSING_LLM_MODEL;
    delete process.env.LINK_PROCESSING_DRAFT_MODEL;
    delete process.env.LINK_PROCESSING_REVISE_MODEL;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  test("returns JSON config error when vault is missing", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(
      ["node", "link-processing", "process", "https://example.dev/agent", "--json"],
      { from: "node" }
    );

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    writeSpy.mockRestore();
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("OBSIDIAN_CONFIG_MISSING");
  });

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

  test("returns stable JSON error for mutually exclusive duplicate options", async () => {
    const { mkdtemp, rm } = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-process-options-"));

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
        "--vault",
        tempDir,
        "--llm-provider",
        "mock",
        "--skip-existing",
        "--update-existing"
      ],
      { from: "node" }
    );

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    writeSpy.mockRestore();
    await rm(tempDir, { recursive: true, force: true });

    const parsed = JSON.parse(output);
    expect(parsed).toEqual({
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
