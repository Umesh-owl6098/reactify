import type { ZodError } from "zod";

export interface ValidationIssueDetail {
  path: string;
  code: string;
  message: string;
  expected?: string;
  received?: string;
}

export function formatZodValidationIssues(error: ZodError): ValidationIssueDetail[] {
  return error.issues.map((issue) => ({
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    code: issue.code,
    message: issue.message,
    expected: "expected" in issue ? stringifyIssueValue(issue.expected) : undefined,
    received: "received" in issue ? stringifyIssueValue(issue.received) : undefined,
  }));
}

function stringifyIssueValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function truncateForSafeLog(text: string, maxLength = 500): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…[truncated ${text.length - maxLength} chars]`;
}

export function summarizeInvalidShape(value: unknown): Record<string, unknown> {
  if (value === null) {
    return { type: "null" };
  }
  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      firstItemType: value[0] === undefined ? "undefined" : typeof value[0],
    };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      type: "object",
      keys: Object.keys(record).slice(0, 20),
      filesType: record.files === undefined ? "undefined" : Array.isArray(record.files) ? "array" : typeof record.files,
      componentsType: record.components === undefined ? "undefined" : Array.isArray(record.components) ? "array" : typeof record.components,
      dependenciesType:
        record.dependencies === undefined ? "undefined" : Array.isArray(record.dependencies) ? "array" : typeof record.dependencies,
    };
  }
  return { type: typeof value };
}
