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
