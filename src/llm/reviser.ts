import OpenAI from "openai";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";
import { REVISE_PROMPT } from "./prompts/revise-prompt.js";
import { extractJson } from "./extract-json.js";

export type ReviserOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export type ReviseInput = {
  originalMarkdown: string;
  draft: ProcessedNote;
};

export class Reviser {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: ReviserOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch,
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 65536;
  }

  async revise(input: ReviseInput): Promise<ProcessedNote> {
    const userMessage = [
      "=== 原文（Markdown 格式）===",
      input.originalMarkdown,
      "",
      "=== 当前笔记草稿 ===",
      JSON.stringify(input.draft, null, 2),
      "",
      "请对照原文审查草稿，输出修订后的完整笔记 JSON。",
    ].join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: REVISE_PROMPT },
        { role: "user", content: userMessage },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    // Strip <think> blocks from Qwen3-style thinking output, keep the JSON.
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return processedNoteSchema.parse(parsed);
  }
}
