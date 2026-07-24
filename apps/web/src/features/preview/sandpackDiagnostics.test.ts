import { describe, expect, it } from "vitest";
import {
  dedupeDiagnostics,
  normalizeReactRenderError,
  normalizeRuntimeConsoleEvent,
  normalizeSandpackProblem,
  truncateDiagnosticMessage,
} from "./sandpackDiagnostics";

describe("sandpackDiagnostics", () => {
  it("normalizes syntax, dependency, and TypeScript problems", () => {
    const syntax = normalizeSandpackProblem({
      message: "Unexpected token",
      severity: "error",
      source: "typescript",
      fileName: "/src/App.tsx",
      line: 4,
      column: 12,
    });
    expect(syntax.filePath).toBe("src/App.tsx");

    const dependency = normalizeSandpackProblem({
      message: "Could not find dependency 'missing-lib'",
      severity: "error",
      source: "bundler",
    });
    expect(dependency.source).toBe("bundler");

    const typescript = normalizeSandpackProblem({
      message: "Type 'string' is not assignable to type 'number'",
      severity: "error",
      source: "typescript",
    });
    expect(typescript.category).toBe("compilation");
  });

  it("normalizes runtime and React render errors", () => {
    const runtime = normalizeRuntimeConsoleEvent({
      level: "error",
      message: "ReferenceError: missingValue is not defined",
    });
    expect(runtime?.source).toBe("runtime");

    const react = normalizeReactRenderError("Rendered fewer hooks than expected");
    expect(react.source).toBe("react");
  });

  it("treats warning-only console events separately", () => {
    const warning = normalizeRuntimeConsoleEvent({
      level: "warn",
      message: "React development warnings about useEffect",
    });
    expect(warning?.severity).toBe("warning");
  });

  it("sanitizes secrets, paths, and oversized diagnostics", () => {
    const sanitized = normalizeSandpackProblem({
      message: "Authorization: Bearer secret-token at /Users/test/project/src/App.tsx",
      severity: "error",
      source: "runtime",
    });

    expect(sanitized.message).not.toContain("/Users/test");
    expect(sanitized.message).toContain("[redacted]");
    expect(truncateDiagnosticMessage("x".repeat(3000)).length).toBeLessThanOrEqual(2000);
  });

  it("deduplicates repeated diagnostics", () => {
    const first = normalizeSandpackProblem({ message: "Duplicate", severity: "error" });
    const second = normalizeSandpackProblem({ message: "Duplicate", severity: "error" });
    expect(dedupeDiagnostics([first, second])).toHaveLength(1);
  });
});
