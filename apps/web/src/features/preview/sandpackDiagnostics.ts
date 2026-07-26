import type { Diagnostic } from "@reactify/generation-contracts";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/g,
  /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi,
  /authorization\s*[:=]\s*["'][^"']+["']/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

const EXTENSION_PATH_PATTERN = /(?:chrome|moz)-extension:\/\/[^\s]+/gi;

export interface SandpackProblem {
  title?: string;
  message?: string;
  severity?: "error" | "warning" | "info";
  source?: string;
  fileName?: string;
  line?: number;
  column?: number;
  code?: string;
  stack?: string;
}

export interface RuntimeConsoleEvent {
  level: "error" | "warn" | "info";
  message: string;
  stack?: string;
}

function redactSecrets(value: string): string {
  let next = value.slice(0, MAX_MESSAGE_LENGTH);
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, "[redacted]");
  }
  next = next.replace(/\/Users\/[^\s]+/g, "[path]");
  next = next.replace(/\/home\/[^\s]+/g, "[path]");
  next = next.replace(EXTENSION_PATH_PATTERN, "[extension]");
  return next;
}

function sanitizeStack(stack?: string): string | undefined {
  if (!stack) {
    return undefined;
  }

  return redactSecrets(stack).slice(0, MAX_STACK_LENGTH);
}

function mapSeverity(value: string | undefined, fallback: Diagnostic["severity"]): Diagnostic["severity"] {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return fallback;
}

function mapSource(source: string | undefined): Diagnostic["source"] {
  switch (source) {
    case "sandpack":
    case "bundler":
    case "typescript":
    case "runtime":
    case "console":
    case "react":
      return source;
    default:
      return "sandpack";
  }
}

export function normalizeSandpackProblem(problem: SandpackProblem): Diagnostic {
  const message = redactSecrets(problem.message ?? problem.title ?? "Unknown Sandpack error");
  const severity = mapSeverity(problem.severity, "error");
  const stack = problem.stack ? sanitizeStack(problem.stack) : undefined;

  return {
    code: problem.code ?? "SANDBOX_ERROR",
    message,
    severity,
    source: mapSource(problem.source),
    category: severity === "warning" ? "warning" : "compilation",
    filePath: problem.fileName?.replace(/^\/+/, ""),
    line: problem.line,
    column: problem.column,
    stack,
  };
}

export function normalizeRuntimeConsoleEvent(event: RuntimeConsoleEvent): Diagnostic | null {
  if (event.level === "info") {
    return null;
  }

  const severity: Diagnostic["severity"] = event.level === "warn" ? "warning" : "error";
  const message = redactSecrets(event.message);

  if (severity === "warning" && /React development warnings|accessibility/i.test(message)) {
    return {
      code: "RUNTIME_WARNING",
      message,
      severity: "warning",
      source: "console",
      category: "runtime-warning",
    };
  }

  return {
    code: severity === "warning" ? "RUNTIME_WARNING" : "RUNTIME_ERROR",
    message,
    severity,
    source: event.level === "warn" ? "console" : "runtime",
    category: severity === "warning" ? "runtime-warning" : "runtime-error",
    stack: sanitizeStack(event.stack),
  };
}

export function normalizeReactRenderError(message: string, stack?: string): Diagnostic {
  return {
    code: "REACT_RENDER_ERROR",
    message: redactSecrets(message),
    severity: "error",
    source: "react",
    category: "react-render",
    stack: sanitizeStack(stack),
  };
}

export function normalizeCompilationTimeoutError(
  lastStatus: string,
  timeoutMs: number,
): Diagnostic {
  return {
    code: "SANDBOX_COMPILATION_TIMEOUT",
    message: `Sandpack compilation did not become ready within ${timeoutMs}ms (last status: ${lastStatus}).`,
    severity: "error",
    source: "sandpack",
    category: "compilation-timeout",
  };
}

export function truncateDiagnosticMessage(message: string, maxLength = MAX_MESSAGE_LENGTH): string {
  if (message.length <= maxLength) {
    return message;
  }
  return `${message.slice(0, maxLength - 3)}...`;
}

export function dedupeDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];

  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.message,
      diagnostic.filePath ?? "",
      diagnostic.line ?? "",
      diagnostic.column ?? "",
      diagnostic.severity,
    ].join("|");

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(diagnostic);
  }

  return result;
}
