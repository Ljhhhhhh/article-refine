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
    return processedNoteSchema.parse({
      title: input.title ?? "未命名链接笔记",
      contentType: "综合",
      summary: input.rawText.slice(0, 120),
      keyPoints: [
        { title: "核心内容", detail: "原文提供了值得保存的核心信息。" },
        { title: "处理价值", detail: "内容可以被结构化为 Obsidian 链接笔记。" },
        { title: "后续连接", detail: "该内容可以与现有知识主题建立关联。" }
      ],
      knowledgeConnections: ["链接笔记", input.linkType],
      quality: {
        informationDensity: "medium",
        originality: "medium",
        practicality: "medium",
        recommendedSave: "normal"
      },
      tags: ["#链接笔记", "#综合"]
    });
  }
}
