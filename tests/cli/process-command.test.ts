import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/index.js";

describe("process command", () => {
  let savedVault: string | undefined;

  beforeEach(() => {
    savedVault = process.env.LINK_PROCESSING_VAULT;
    delete process.env.LINK_PROCESSING_VAULT;
  });

  afterEach(() => {
    if (savedVault !== undefined) {
      process.env.LINK_PROCESSING_VAULT = savedVault;
    }
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
});
