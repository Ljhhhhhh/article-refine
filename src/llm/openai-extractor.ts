import OpenAI from "openai";
import { AppError } from "../errors/errors.js";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import { extractJson } from "./extract-json.js";
import type { ExtractNoteInput, NoteExtractor } from "./note-extractor.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";

const SYSTEM_PROMPT = `你是一个内容分析助手。请分析用户提供的网页内容，输出 JSON 符合以下格式：
{
  "title": "标题",
  "contentType": "技术深度|观点思考|教程学习|资讯动态|综合",
  "summary": "100-200字摘要",
  "keyPoints": [{"title": "要点标题", "detail": "详细说明"}],
  "technicalAnalysis": {"architecture": "...", "mechanism": "...", "performance": "...", "deployment": "..."},
  "knowledgeConnections": ["关联主题"],
  "quality": {"informationDensity": "high|medium|low", "originality": "high|medium|low", "practicality": "high|medium|low", "recommendedSave": "strong|normal|reference"},
  "tags": ["#标签"]
}
keyPoints 必须 3-7 个。tags 必须 2-6 个，以 # 开头。
技术类内容（contentType 为"技术深度"）必须填写 technicalAnalysis。
只输出 JSON，不要其他文字。`;

export type OpenAIExtractorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export class OpenAINoteExtractor implements NoteExtractor {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: OpenAIExtractorOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async extract(input: ExtractNoteInput): Promise<ProcessedNote> {
    const userMessage = [
      `来源：${input.sourceUrl}`,
      `类型：${input.linkType}`,
      input.title ? `标题：${input.title}` : null,
      input.author ? `作者：${input.author}` : null,
      `分析提示：contentType=${input.analysis.contentType}, wordCount=${input.analysis.wordCount}`,
      "",
      "内容：",
      input.rawText.slice(0, 12000)
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" }
      });

      const raw = response.choices[0]?.message?.content ?? "";
      const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      const parsed = extractJson(text);
      return processedNoteSchema.parse(parsed);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new AppError("LLM_OUTPUT_INVALID", `Failed to parse LLM JSON: ${error.message}`);
      }
      if (error instanceof Error && error.message.includes("ZodError")) {
        throw new AppError("LLM_OUTPUT_INVALID", `LLM output failed schema validation: ${error.message}`);
      }
      throw error;
    }
  }
}
