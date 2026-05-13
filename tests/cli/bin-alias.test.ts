import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("package bin aliases", () => {
  test("registers lpa as a global alias for the TUI", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as { bin: Record<string, string> };
    expect(pkg.bin["link-processing"]).toBe("./dist/cli/index.js");
    expect(pkg.bin.lpa).toBe("./dist/cli/lpa.js");
  });
});
