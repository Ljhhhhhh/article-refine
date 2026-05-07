import type { AnalysisResult } from "../analyzer/content-analyzer.js";
import type { LinkType } from "../router/types.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";

export type ExtractNoteInput = {
  sourceUrl: string;
  linkType: LinkType;
  title?: string;
  author?: string;
  rawText: string;
  analysis: AnalysisResult;
};

export interface NoteExtractor {
  extract(input: ExtractNoteInput): Promise<ProcessedNote>;
}

export class MockNoteExtractor implements NoteExtractor {
  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    return processedNoteSchema.parse({
      title: input.title ?? "未命名链接笔记",
      contentType: input.analysis.contentType,
      summary: input.rawText.slice(0, 120),
      keyPoints: [
        { title: "核心内容", detail: "原文提供了值得保存的核心信息。" },
        { title: "处理价值", detail: "内容可以被结构化为 Obsidian 链接笔记。" },
        { title: "后续连接", detail: "该内容可以与现有知识主题建立关联。" }
      ],
      technicalAnalysis:
        input.analysis.contentType === "技术深度"
          ? {
              architecture: "原文涉及系统或工具架构。",
              mechanism: "原文包含实现机制或工程实践。",
              performance: "原文包含可用于性能或质量判断的信息。",
              deployment: "原文可沉淀为后续部署或使用建议。"
            }
          : undefined,
      knowledgeConnections: ["链接笔记", input.linkType],
      quality: {
        informationDensity: input.analysis.qualityHints.informationDensity,
        originality: "medium",
        practicality: input.analysis.qualityHints.practicality,
        recommendedSave:
          input.analysis.qualityHints.informationDensity === "high" ? "strong" : "normal"
      },
      tags: input.analysis.recommendedTags
    });
  }
}
