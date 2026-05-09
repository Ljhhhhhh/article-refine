import { AppError } from "../errors/errors.js";

export function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // not pure JSON, continue
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
      try {
        const parsed = JSON.parse(candidate);
        if (typeof parsed === "object" && parsed !== null) {
          if ("title" in parsed && "body" in parsed) {
            return parsed;
          }
          candidates.push(parsed);
        }
      } catch {
        // not valid JSON, skip
      }
    }
  }

  if (candidates.length > 0) {
    return candidates[0];
  }

  throw new AppError("LLM_OUTPUT_INVALID", `LLM response did not contain valid JSON. Response preview: ${text.slice(0, 300)}`);
}
