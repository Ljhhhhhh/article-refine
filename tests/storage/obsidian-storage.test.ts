import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { saveObsidianNote } from "../../src/storage/obsidian-storage.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "link-processing-vault-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("saveObsidianNote", () => {
  test("creates the approved Obsidian directory structure and writes markdown", async () => {
    const saved = await saveObsidianNote({
      vaultPath: tempDir,
      title: "AI Agent 架构设计",
      contentType: "技术深度",
      markdown: "# AI Agent 架构设计\n",
      tags: ["#技术深度", "#AI编程", "#链接笔记"],
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(saved.saved).toBe(true);
    expect(saved.filename).toBe("2026-05-07-AI Agent 架构设计.md");
    expect(saved.path).toContain(path.join("文章摘要", "技术深度", saved.filename));
    await expect(stat(path.join(tempDir, "文章摘要", "技术深度"))).resolves.toBeTruthy();
    await expect(stat(path.join(tempDir, "标签索引"))).resolves.toBeTruthy();
    await expect(stat(path.join(tempDir, "作者索引"))).resolves.toBeTruthy();
    await expect(stat(path.join(tempDir, "时间线"))).resolves.toBeTruthy();
    await expect(readFile(saved.path, "utf8")).resolves.toBe("# AI Agent 架构设计\n");
  });

  test("does not overwrite an existing note", async () => {
    const first = await saveObsidianNote({
      vaultPath: tempDir,
      title: "标题",
      contentType: "综合",
      markdown: "# first\n",
      tags: ["#综合", "#链接笔记"],
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });
    const second = await saveObsidianNote({
      vaultPath: tempDir,
      title: "标题",
      contentType: "综合",
      markdown: "# second\n",
      tags: ["#综合", "#链接笔记"],
      now: () => new Date("2026-05-07T10:00:00.000Z")
    });

    expect(first.filename).toBe("2026-05-07-标题.md");
    expect(second.filename).toBe("2026-05-07-标题 (1).md");
  });
});
