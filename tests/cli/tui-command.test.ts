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
