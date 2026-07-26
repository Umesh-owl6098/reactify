export function extractJsonFromModelText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

export function isLikelyTruncatedJson(rawText: string, parseError?: unknown): boolean {
  const extracted = extractJsonFromModelText(rawText).trim();
  if (parseError instanceof SyntaxError) {
    if (/unexpected end of json input|unterminated string/i.test(parseError.message)) {
      return true;
    }
    return false;
  }
  if (parseError instanceof Error && /unexpected end|unterminated/i.test(parseError.message)) {
    return true;
  }
  if (extracted.length < 32) {
    return false;
  }
  if (!extracted.endsWith("}") && !extracted.endsWith("]")) {
    return true;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (const char of extracted) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
    }
  }

  return depth !== 0 || inString;
}
