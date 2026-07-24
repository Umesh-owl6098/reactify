import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { validateProjectPatch } from "./patchValidator.js";

describe("patchValidator", () => {
  it("accepts valid file replacement", () => {
    const file = generatedProjectFixture.files.find((item) => item.path === "src/App.tsx")!;
    const result = validateProjectPatch(
      {
        schemaVersion: "1",
        responseVersion: "test",
        repairSummary: "Fix App",
        changedFiles: [
          {
            path: "src/App.tsx",
            fullContent: file.content,
            language: "tsx",
            reason: "Fix render",
          },
        ],
        deletedFiles: [],
        dependencyChanges: [],
        expectedResolvedDiagnostics: [],
        unresolvedRisks: [],
      },
      { maxFileBytes: 1024 * 1024, maxTotalBytes: 2 * 1024 * 1024 },
    );
    expect(result.ok).toBe(true);
  });

  it("rejects traversal paths", () => {
    const result = validateProjectPatch(
      {
        schemaVersion: "1",
        responseVersion: "test",
        repairSummary: "Bad path",
        changedFiles: [
          {
            path: "../secret.ts",
            fullContent: "export {}",
            language: "ts",
            reason: "bad",
          },
        ],
        deletedFiles: [],
        dependencyChanges: [],
        expectedResolvedDiagnostics: [],
        unresolvedRisks: [],
      },
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  function basePatch(overrides: Record<string, unknown> = {}) {
    return {
      schemaVersion: "1",
      responseVersion: "test",
      repairSummary: "Patch",
      changedFiles: [],
      deletedFiles: [],
      dependencyChanges: [],
      expectedResolvedDiagnostics: [],
      unresolvedRisks: [],
      ...overrides,
    };
  }

  it("rejects absolute paths", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: "/etc/passwd", fullContent: "x", language: "ts", reason: "bad" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects environment files", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: ".env", fullContent: "SECRET=1", language: "txt", reason: "bad" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects node_modules paths", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: "node_modules/react/index.js", fullContent: "x", language: "js", reason: "bad" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate changed paths", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [
          { path: "src/App.tsx", fullContent: "a", language: "tsx", reason: "a" },
          { path: "src/App.tsx", fullContent: "b", language: "tsx", reason: "b" },
        ],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects changed and deleted same path", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: "src/App.tsx", fullContent: "a", language: "tsx", reason: "a" }],
        deletedFiles: [{ path: "src/App.tsx", reason: "remove" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects deleting required files", () => {
    const result = validateProjectPatch(
      basePatch({
        deletedFiles: [{ path: "src/App.tsx", reason: "remove app" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects unsafe source", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: "src/App.tsx", fullContent: "eval('bad')", language: "tsx", reason: "bad" }],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects disallowed dependency", () => {
    const result = validateProjectPatch(
      basePatch({
        dependencyChanges: [
          {
            packageName: "express",
            action: "add",
            targetGroup: "dependencies",
            version: "4.19.0",
            reason: "bad",
          },
        ],
      }),
      { maxFileBytes: 1024, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects oversized files", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [{ path: "src/App.tsx", fullContent: "x".repeat(2048), language: "tsx", reason: "big" }],
      }),
      { maxFileBytes: 100, maxTotalBytes: 2048 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects oversized total patch", () => {
    const result = validateProjectPatch(
      basePatch({
        changedFiles: [
          { path: "src/App.tsx", fullContent: "x".repeat(1500), language: "tsx", reason: "big" },
          { path: "src/main.tsx", fullContent: "y".repeat(1500), language: "tsx", reason: "big" },
        ],
      }),
      { maxFileBytes: 2048, maxTotalBytes: 2000 },
    );
    expect(result.ok).toBe(false);
  });

  it("rejects empty patch operations", () => {
    const result = validateProjectPatch(basePatch(), { maxFileBytes: 1024, maxTotalBytes: 2048 });
    expect(result.ok).toBe(false);
  });
});
