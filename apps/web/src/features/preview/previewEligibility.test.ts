import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import {
  isComparisonCaptureReady,
  isSandpackPreviewEnabled,
  shouldLoadSandpackPreviewFiles,
} from "./previewEligibility";

function createStatus(overrides: Partial<GenerationStatusResponse> = {}): GenerationStatusResponse {
  return {
    id: "gen-1",
    status: "Ready",
    projectHash: "hash",
    awaitingSandboxValidation: false,
    sandboxValidation: {
      projectHash: "hash",
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: {
        schemaVersion: "1",
        responseVersion: "1",
        projectName: "Demo",
        summary: "Demo",
        dependencies: {},
        devDependencies: {},
        files: [],
        entryFile: "src/main.tsx",
        components: [],
        warnings: [],
      },
    },
    ...overrides,
  } as GenerationStatusResponse;
}

describe("previewEligibility", () => {
  it("loads preview files for Ready generations with sandbox validation", () => {
    expect(shouldLoadSandpackPreviewFiles(createStatus())).toBe(true);
    expect(isSandpackPreviewEnabled(createStatus())).toBe(true);
    expect(isComparisonCaptureReady(createStatus())).toBe(true);
  });

  it("loads preview files while awaiting sandbox validation", () => {
    const status = createStatus({
      status: "Compiling",
      awaitingSandboxValidation: true,
      sandboxValidation: null,
    });
    expect(shouldLoadSandpackPreviewFiles(status)).toBe(true);
  });

  it("does not load preview files before project hash exists", () => {
    expect(shouldLoadSandpackPreviewFiles(createStatus({ projectHash: null, sandboxValidation: null }))).toBe(false);
  });
});
