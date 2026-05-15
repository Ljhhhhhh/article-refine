import { AppError } from "../errors/errors.js";

/**
 * Fix literal newlines inside JSON string values.
 * Some LLMs output real newlines in "body" instead of \n,
 * which violates the JSON spec and breaks JSON.parse.
 */
function fixLiteralNewlinesInStrings(json: string): string {
  return json.replace(/"((?:[^"\\]|\\.)*)"/gs, (match) => {
    // Replace literal newlines inside the matched string with \n
    return match.replace(/\r?\n/g, "\\n");
  });
}

/**
 * Strip thinking/reasoning content that some LLMs emit before the actual JSON.
 * Handles <think>...</think>, Thinking Process:, Reasoning:, and untagged
 * free-form reasoning text that appears before the first top-level JSON object.
 */
function stripThinking(raw: string): string {
  let text = raw;
  // <think>...</think> (Qwen3 / DeepSeek-R1 style)
  text = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  // Thinking Process: ... up to first {
  text = text.replace(/^Thinking Process:[\s\S]*?(?=\{)/, "");
  // Reasoning: ... up to first {
  text = text.replace(/^Reasoning:[\s\S]*?(?=\{)/, "");
  text = text.trim();

  // Generic fallback: if the text doesn't start with '{', find the last
  // complete balanced {...} block and discard everything outside it.
  // This handles models (e.g. DeepSeek-V3/V4) that emit untagged reasoning prose
  // before (or after) the JSON output, including prose with curly/smart quotes
  // that would confuse string-tracking heuristics.
  if (!text.startsWith("{")) {
    const idx = findLastBalancedObject(text);
    if (idx >= 0) {
      text = text.slice(idx).trim();
    }
  }

  return text;
}

/**
 * Find the start index of the last complete balanced {...} block in the text.
 * Works backwards from the last '}' and uses brace depth counting only —
 * no string-tracking — so it is immune to curly quotes and mixed prose.
 * Returns -1 if no balanced block is found.
 */
function findLastBalancedObject(text: string): number {
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    let depth = 0;
    for (let i = end; i >= 0; i--) {
      if (text[i] === "}") depth++;
      if (text[i] === "{") {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

export function extractJson(raw: string): unknown {
  const text = stripThinking(raw);

  try {
    return JSON.parse(text);
  } catch {
    // not pure JSON, continue
  }

  // Try fixing literal newlines in string values (common LLM mistake)
  try {
    return JSON.parse(fixLiteralNewlinesInStrings(text));
  } catch {
    // still not valid, continue
  }

  const candidates: unknown[] = [];

  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    let depth = 0;
    let start = -1;
    for (let i = end; i >= 0; i--) {
      if (text[i] === "}") depth++;
      if (text[i] === "{") {
        depth--;
        if (depth === 0) {
          start = i;
          break;
        }
      }
    }
    if (start >= 0) {
      const candidate = text.slice(start, end + 1);
      for (const c of [candidate, fixLiteralNewlinesInStrings(candidate)]) {
        try {
          const parsed = JSON.parse(c);
          if (typeof parsed === "object" && parsed !== null) {
            if ("title" in parsed && "body" in parsed) {
              return parsed;
            }
            candidates.push(parsed);
            break;
          }
        } catch {
          // not valid JSON, skip
        }
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  // Attempt to repair truncated JSON: close open strings, arrays, and objects.
  let repaired = text;
  const lastBrace = repaired.lastIndexOf("{");
  if (lastBrace >= 0) {
    repaired = repaired.slice(lastBrace);
    // If inside a string value, close it.
    let inString = false;
    let escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === "\\") { escape = true; continue; }
      if (ch === '"') inString = !inString;
    }
    if (inString) repaired += '"';
    // Close any open arrays and objects.
    const opens = (repaired.match(/\[/g) || []).length;
    const closes = (repaired.match(/]/g) || []).length;
    for (let i = 0; i < opens - closes; i++) repaired += "]";
    const objOpens = (repaired.match(/{/g) || []).length;
    const objCloses = (repaired.match(/}/g) || []).length;
    for (let i = 0; i < objOpens - objCloses; i++) repaired += "}";

    for (const r of [repaired, fixLiteralNewlinesInStrings(repaired)]) {
      try {
        const parsed = JSON.parse(r);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed;
        }
      } catch {
        // repair failed
      }
    }
  }

  throw new AppError("LLM_OUTPUT_INVALID", `LLM response did not contain valid JSON. Response preview: ${text.slice(0, 300)}`);
}
