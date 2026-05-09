import OpenAI from "openai";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import type { FetchedContent } from "../fetchers/fetcher.js";
import { processedNoteSchema, type ProcessedNote, type Step1Analysis } from "./schema.js";
import { getStep2Prompt } from "./prompts/index.js";
import { extractJson } from "./extract-json.js";

export type Step2GeneratorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export class Step2Generator {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: Step2GeneratorOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async generate(
    input: Pick<FetchedContent, "sourceUrl" | "rawText"> & { linkType: string },
    analysis: Step1Analysis
  ): Promise<ProcessedNote> {
    const systemPrompt = getStep2Prompt(analysis.contentType);

    const userMessage = [
      `以下是内容分析结果：`,
      JSON.stringify(analysis, null, 2),
      "",
      `以下是原文内容：`,
      input.rawText
    ].join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return processedNoteSchema.parse(parsed);
  }
}
