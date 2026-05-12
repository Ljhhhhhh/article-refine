import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors/errors.js";
import { createFileNamer, type ContentTypeDirectory } from "./file-naming.js";

export type SaveObsidianNoteInput = {
  vaultPath: string;
  title: string;
  contentType: ContentTypeDirectory;
  markdown: string;
  tags: string[];
  now?: () => Date;
  existingPath?: string;
};

export type SavedNote = {
  saved: true;
  path: string;
  filename: string;
  tags: string[];
};

export function generateNoteFilename(input: {
  title: string;
  contentType: ContentTypeDirectory;
  now?: () => Date;
}): string {
  const now = input.now ?? (() => new Date());
  const namer = createFileNamer({ exists: () => false, now });
  const simplifiedTitle = namer.simplifyTitle(input.title) || "未命名链接笔记";
  const date = now().toISOString().slice(0, 10);
  return `${date}-${simplifiedTitle}.md`;
}

const ROOT_DIRECTORIES = ["文章摘要", "标签索引", "作者索引", "时间线"];

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function saveObsidianNote(input: SaveObsidianNoteInput): Promise<SavedNote> {
  try {
    if (input.existingPath) {
      const tempPath = `${input.existingPath}.tmp-${Date.now()}`;
      await writeFile(tempPath, input.markdown, "utf8");
      await rename(tempPath, input.existingPath);
      return {
        saved: true,
        path: input.existingPath,
        filename: path.basename(input.existingPath),
        tags: input.tags
      };
    }

    for (const directory of ROOT_DIRECTORIES) {
      await mkdir(path.join(input.vaultPath, directory), { recursive: true });
    }

    const targetDirectory = path.join(input.vaultPath, "文章摘要", input.contentType);
    await mkdir(targetDirectory, { recursive: true });

    const now = input.now ?? (() => new Date());
    const namer = createFileNamer({ exists: () => false, now });
    const simplifiedTitle = namer.simplifyTitle(input.title) || "未命名链接笔记";
    const date = now().toISOString().slice(0, 10);
    let suffix = 0;
    let filename = `${date}-${simplifiedTitle}.md`;
    let targetPath = path.join(targetDirectory, filename);

    while (await exists(targetPath)) {
      suffix += 1;
      filename = `${date}-${simplifiedTitle} (${suffix}).md`;
      targetPath = path.join(targetDirectory, filename);
    }

    const tempPath = `${targetPath}.tmp-${Date.now()}`;
    await writeFile(tempPath, input.markdown, "utf8");
    await rename(tempPath, targetPath);

    return {
      saved: true,
      path: targetPath,
      filename,
      tags: input.tags
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to write Obsidian note.";
    throw new AppError("OBSIDIAN_WRITE_FAILED", message);
  }
}
