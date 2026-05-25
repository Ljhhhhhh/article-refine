import OpenAI from "openai";
import { proxyFetch } from "../fetchers/proxy-fetch.js";
import { AppError } from "../errors/errors.js";
import { COMPRESS_PROMPT } from "./prompts/compress-prompt.js";

export type CompressorOptions = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
};

export type CompressIfLongOptions = {
  maxChars: number;
  client?: OpenAI;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

const HARD_CHUNK_SIZE = 2000;

/**
 * Split markdown into chunks by heading boundaries.
 * Preference order: H2 → H1 → hard split at HARD_CHUNK_SIZE.
 */
export function splitMarkdownByHeadings(markdown: string): string[] {
  const h2Matches = [...markdown.matchAll(/^##\s+.+$/gm)];
  const h1Matches = [...markdown.matchAll(/^#\s+.+$/gm)];

  let boundaries: number[] = [];
  if (h2Matches.length >= 2) {
    boundaries = h2Matches.map((m) => m.index ?? 0);
  } else if (h1Matches.length >= 2) {
    boundaries = h1Matches.map((m) => m.index ?? 0);
  }

  if (boundaries.length === 0) {
    // No usable heading structure; hard split.
    const chunks: string[] = [];
    for (let i = 0; i < markdown.length; i += HARD_CHUNK_SIZE) {
      chunks.push(markdown.slice(i, i + HARD_CHUNK_SIZE));
    }
    return chunks;
  }

  if (boundaries[0] !== 0) {
    boundaries = [0, ...boundaries];
  }

  const chunks: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] : markdown.length;
    const chunk = markdown.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function compressChunk(
  client: OpenAI,
  model: string,
  chunk: string
): Promise<string> {
  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: "system", content: COMPRESS_PROMPT },
      { role: "user", content: chunk }
    ]
  });
  const choice = response.choices?.[0];
  if (!choice) {
    throw new AppError(
      "LLM_OUTPUT_INVALID",
      `LLM returned empty response (no choices) during compression.`,
    );
  }
  const raw = choice.message?.content ?? "";
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * If markdown exceeds maxChars, split by headings and compress each chunk in
 * parallel via the LLM, then rejoin. Otherwise returns the input unchanged.
 */
export async function compressIfLong(
  markdown: string,
  options: CompressIfLongOptions
): Promise<string> {
  if (markdown.length <= options.maxChars) {
    return markdown;
  }

  const client =
    options.client ??
    new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      fetch: proxyFetch as typeof fetch
    });

  const chunks = splitMarkdownByHeadings(markdown);
  const compressed = await Promise.all(
    chunks.map((chunk) => compressChunk(client, options.model, chunk))
  );
  return compressed.filter(Boolean).join("\n\n");
}
