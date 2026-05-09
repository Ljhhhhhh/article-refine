import OpenAI from "openai";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import { AppError } from "../errors/errors.js";
import { processedNoteSchema, type ProcessedNote } from "./schema.js";
import { DRAFT_PROMPT } from "./prompts/draft-prompt.js";
import { extractJson } from "./extract-json.js";

export type DraftGeneratorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export type DraftInput = {
  sourceUrl: string;
  title?: string;
  author?: string;
  rawText: string;
};

export class DraftGenerator {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: DraftGeneratorOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 16384;
  }

  async generate(input: DraftInput): Promise<ProcessedNote> {
    const userMessage = [
      `来源：${input.sourceUrl}`,
      input.title ? `原文标题：${input.title}` : null,
      input.author ? `作者：${input.author}` : null,
      "",
      "=== 原文（Markdown 格式）===",
      input.rawText
    ]
      .filter((line) => line !== null)
      .join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: DRAFT_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    const choice = response.choices[0];
    const raw = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length") {
      throw new AppError(
        "LLM_OUTPUT_INVALID",
        `Draft output was truncated at max_tokens=${this.maxTokens}. ` +
          `Increase --draft-max-tokens or LINK_PROCESSING_DRAFT_MAX_TOKENS.`
      );
    }
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return processedNoteSchema.parse(parsed);
  }
}
