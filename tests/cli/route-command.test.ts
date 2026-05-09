import { describe, expect, test, vi } from "vitest";
import { createProgram } from "../../src/cli/index.js";

describe("route command", () => {
  test("prints stable JSON when --json is provided", async () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const program = createProgram();
    program.exitOverride();

    await program.parseAsync(
      ["node", "link-processing", "route", "https://x.com/user/status/123", "--json"],
      { from: "node" }
    );

    const output = writeSpy.mock.calls.map((call) => String(call[0])).join("");
    writeSpy.mockRestore();
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      ok: true,
      command: "route",
      sourceUrl: "https://x.com/user/status/123",
      linkType: "twitter",
      strategy: {
        primary: "twitter_api",
        fallback: "web_fetch",
        requiresFormatting: true
      },
      capability: {
        status: "stable",
        canProcess: true,
        canInspect: true
      }
    });
  });
});
