import { describe, expect, test, vi } from "vitest";
import {
  compressIfLong,
  splitMarkdownByHeadings
} from "../../src/llm/long-content-compressor.js";

describe("splitMarkdownByHeadings", () => {
  test("splits by H2 when multiple H2 headings exist", () => {
    const md = [
      "intro",
      "## First",
      "alpha",
      "## Second",
      "beta",
      "## Third",
      "gamma"
    ].join("\n");

    const chunks = splitMarkdownByHeadings(md);
    expect(chunks).toHaveLength(4);
    expect(chunks[1]).toMatch(/^## First/);
    expect(chunks[2]).toMatch(/^## Second/);
    expect(chunks[3]).toMatch(/^## Third/);
  });

  test("falls back to H1 when only H1 headings exist", () => {
    const md = ["# A", "alpha", "# B", "beta"].join("\n");
    const chunks = splitMarkdownByHeadings(md);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatch(/^# A/);
    expect(chunks[1]).toMatch(/^# B/);
  });

  test("hard-splits when no heading structure", () => {
    const md = "x".repeat(4500);
    const chunks = splitMarkdownByHeadings(md);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("compressIfLong", () => {
  test("returns input unchanged when under threshold", async () => {
    const md = "## Short\n\ncontent";
    const result = await compressIfLong(md, {
      maxChars: 1000,
      apiKey: "x",
      model: "m"
    });
    expect(result).toBe(md);
  });

  test("compresses each chunk via LLM and rejoins when over threshold", async () => {
    const md = [
      "## First",
      "a".repeat(500),
      "## Second",
      "b".repeat(500)
    ].join("\n");

    const create = vi.fn().mockImplementation(async ({ messages }) => {
      const userMsg = messages[1].content as string;
      const heading = userMsg.match(/## \w+/)?.[0] ?? "";
      return {
        choices: [{ message: { content: `${heading}\n\n[compressed]` } }]
      };
    });

    const result = await compressIfLong(md, {
      maxChars: 100,
      apiKey: "x",
      model: "m",
      client: { chat: { completions: { create } } } as unknown as import("openai").default
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result).toContain("## First");
    expect(result).toContain("## Second");
    expect(result).toContain("[compressed]");
  });
});
