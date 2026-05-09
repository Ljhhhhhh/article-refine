import type { LinkType } from "../router/types.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";

export type ExtractNoteInput = {
  sourceUrl: string;
  linkType: LinkType;
  title?: string;
  author?: string;
  rawText: string;
};

export interface NoteExtractor {
  extract(input: ExtractNoteInput): Promise<ProcessedNote>;
}

export class MockNoteExtractor implements NoteExtractor {
  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    const preview = input.rawText.slice(0, 120).trim();
    const body = [
      "## 概述",
      "",
      preview || "（原文内容）",
      "",
      "## 要点",
      "",
      "- 原文提供了值得保存的核心信息",
      "- 内容可以被结构化为 Obsidian 链接笔记",
      "- 该内容可以与现有知识主题建立关联"
    ].join("\n");

    return processedNoteSchema.parse({
      title: input.title ?? "未命名链接笔记",
      contentType: "综合",
      tags: ["#链接笔记", "#综合"],
      knowledgeConnections: ["链接笔记", input.linkType],
      body
    });
  }
}
