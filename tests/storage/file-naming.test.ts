import { describe, expect, test } from "vitest";
import { createFileNamer } from "../../src/storage/file-naming.js";

describe("createFileNamer", () => {
  test("removes invalid characters and common prefixes", () => {
    const namer = createFileNamer({
      exists: () => false,
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(namer.generateFilename("转载: A/B<C> 技术文章！", "技术深度")).toBe(
      "2026-05-07-AB技术文章.md"
    );
  });

  test("keeps simplified title within 80 characters", () => {
    const namer = createFileNamer({
      exists: () => false,
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });
    const title = "架构".repeat(60);

    const filename = namer.generateFilename(title, "技术深度");

    expect(filename.length).toBeLessThanOrEqual("2026-05-07-".length + 80 + ".md".length);
  });

  test("adds numeric suffix when filename already exists", () => {
    const namer = createFileNamer({
      exists: (path) => path.endsWith("2026-05-07-标题.md"),
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(namer.generateFilename("标题", "技术深度")).toBe("2026-05-07-标题 (1).md");
  });
});
