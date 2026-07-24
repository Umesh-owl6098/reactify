import { describe, expect, it } from "vitest";
import { classifyRepairability } from "./repairabilityClassifier.js";

describe("repairabilityClassifier", () => {
  it("classifies syntax errors as repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "SYNTAX", message: "Unexpected token", severity: "error", source: "typescript", category: "syntax" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(true);
  });

  it("classifies missing import as repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "IMPORT", message: "Missing import React", severity: "error", source: "typescript", category: "import" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(true);
  });

  it("classifies React render errors as repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "RENDER", message: "Render error in App", severity: "error", source: "runtime", category: "render" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(true);
  });

  it("classifies unsafe dependency as non-repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "UNSAFE", message: "Dependency express is not allowlisted", severity: "error", source: "typescript", category: "dependency" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(false);
  });

  it("classifies hash mismatch as non-repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "HASH", message: "hash mismatch", severity: "error", source: "typescript", category: "integrity" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
      hashMismatch: true,
    });
    expect(result.repairable).toBe(false);
  });

  it("classifies missing project as non-repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "SYNTAX", message: "Unexpected token", severity: "error", source: "typescript", category: "syntax" }],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: false,
    });
    expect(result.repairable).toBe(false);
  });

  it("classifies maximum attempts as non-repairable", () => {
    const result = classifyRepairability({
      diagnostics: [{ code: "SYNTAX", message: "Unexpected token", severity: "error", source: "typescript", category: "syntax" }],
      attemptCount: 3,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(false);
  });

  it("classifies mixed diagnostics as non-repairable when any rule matches", () => {
    const result = classifyRepairability({
      diagnostics: [
        { code: "SYNTAX", message: "Unexpected token", severity: "error", source: "typescript", category: "syntax" },
        { code: "UNSAFE", message: "disallowed dependency required", severity: "error", source: "typescript", category: "dependency" },
      ],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(false);
  });

  it("classifies empty diagnostics as non-repairable", () => {
    const result = classifyRepairability({
      diagnostics: [],
      attemptCount: 0,
      maxAttempts: 3,
      hasGeneratedProject: true,
    });
    expect(result.repairable).toBe(false);
  });
});
