import OpenAI from "openai";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import type { FetchedContent } from "../fetchers/fetcher.js";
import { step1AnalysisSchema, type Step1Analysis } from "./schema.js";
import { STEP1_PROMPT } from "./prompts/step1-prompt.js";
import { extractJson } from "./extract-json.js";

export type Step1AnalyzerOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export class Step1Analyzer {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;

  constructor(options: Step1AnalyzerOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });
    this.model = options.model;
    this.maxTokens = options.maxTokens ?? 4096;
  }

  async analyze(input: Pick<FetchedContent, "sourceUrl" | "title" | "author" | "rawText"> & { linkType: string }): Promise<Step1Analysis> {
    const userMessage = [
      `来源：${input.sourceUrl}`,
      `类型：${input.linkType}`,
      input.title ? `原文标题：${input.title}` : null,
      input.author ? `作者：${input.author}` : null,
      "",
      "内容：",
      input.rawText.slice(0, 12000)
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [
        { role: "system", content: STEP1_PROMPT },
        { role: "user", content: userMessage }
      ]
    });

    const raw = response.choices[0]?.message?.content ?? "";
    const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    const parsed = extractJson(text);
    return step1AnalysisSchema.parse(parsed);
  }
}
