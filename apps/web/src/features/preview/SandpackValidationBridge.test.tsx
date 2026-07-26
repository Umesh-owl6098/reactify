import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { generatedProjectFixture } from "@reactify/test-utils";
import { SandpackValidationController } from "./SandpackValidationBridge";
import { usePreviewStore } from "./previewStore";

const submitSandboxValidation = vi.fn();
const sandpackState = vi.hoisted(() => ({
  status: "idle" as string,
  error: null as null | { message: string; path?: string; line?: number; column?: number },
}));

vi.mock("../../lib/generation-api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/generation-api")>("../../lib/generation-api");
  return {
    ...actual,
    submitSandboxValidation: (...args: unknown[]) => submitSandboxValidation(...args),
  };
});

vi.mock("@codesandbox/sandpack-react", () => ({
  useSandpack: () => ({
    sandpack: {
      status: sandpackState.status,
      error: sandpackState.error,
    },
  }),
}));

function createCompilingStatus(): GenerationStatusResponse {
  return {
    id: "95d76f53-384d-4c49-9400-c1c0a3553ad2",
    imageId: "660e8400-e29b-41d4-a716-446655440000",
    projectId: "770e8400-e29b-41d4-a716-446655440000",
    status: "Compiling",
    activeStage: "sandbox_compilation",
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: {
        schemaVersion: "1",
        responseVersion: "mock-v1",
        projectName: generatedProjectFixture.projectName,
        summary: generatedProjectFixture.summary,
        dependencies: generatedProjectFixture.dependencies,
        devDependencies: generatedProjectFixture.devDependencies,
        entryFile: generatedProjectFixture.entryFile,
        warnings: generatedProjectFixture.warnings,
        components: generatedProjectFixture.components,
        files: generatedProjectFixture.files.map((file) => ({
          path: file.path,
          language: file.language,
          purpose: file.purpose,
          sizeBytes: file.content.length,
        })),
      },
    },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: null,
    projectHash: "6c4063241b31f64168b6f142e4dc43dbbec8dc050251deb31d13a99f43468161",
    editedByUser: false,
    confirmedAt: "2026-01-01T00:00:00.000Z",
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: true,
    repair: null,
    exportAllowed: false,
    exportBlockedReason: "awaiting_sandbox_validation",
    latestExportSummary: null,
    editAllowed: false,
    editBlockedReason: null,
    activeEditId: null,
    activeEditStatus: null,
    clarificationRequired: false,
    clarificationQuestion: null,
    latestEditSummary: null,
    activeVersionId: "6c4063241b31f64168b6f142e4dc43dbbec8dc050251deb31d13a99f43468161",
    activeVersionNumber: 1,
    sandboxRevalidationRequired: false,
    visualComparisonAllowed: false,
    visualComparisonBlockedReason: "awaiting_sandbox_validation",
    activeComparisonId: null,
    activeComparisonStatus: null,
    latestSimilarityScore: null,
    latestDifferencePercentage: null,
    visualCorrectionAvailable: false,
    visualCorrectionStatus: null,
    visualCorrectionAttempt: 0,
    visualCorrectionMaxAttempts: 3,
    previewCaptureRequired: false,
    featureFlags: { enableGenerationPlanEditing: true },
    manualRetryAllowed: false,
    retryAllowed: false,
    errors: [],
    durations: { totalMs: 0, stages: {} },
  };
}

describe("SandpackValidationController", () => {
  beforeEach(() => {
    sandpackState.status = "idle";
    sandpackState.error = null;
    submitSandboxValidation.mockReset();
    submitSandboxValidation.mockResolvedValue("Ready");
    usePreviewStore.getState().reset();
  });

  it("submits successful validation when Sandpack remains running without errors", async () => {
    sandpackState.status = "running";
    const status = createCompilingStatus();
    const projectFiles = generatedProjectFixture.files.map((file) => ({
      path: file.path,
      content: file.content,
    }));

    render(
      <SandpackValidationController
        status={status}
        projectFiles={projectFiles}
        onReportSubmitted={() => undefined}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(() => {
      expect(submitSandboxValidation).toHaveBeenCalledTimes(1);
    });

    const report = submitSandboxValidation.mock.calls[0]?.[1] as {
      compilation: { success: boolean };
      runtime: { success: boolean };
    };
    expect(report.compilation.success).toBe(true);
    expect(report.runtime.success).toBe(true);
  });

  it("submits sandbox validation after parent rerenders with a new callback reference", async () => {
    const status = createCompilingStatus();
    const projectFiles = generatedProjectFixture.files.map((file) => ({
      path: file.path,
      content: file.content,
    }));
    const onReportSubmitted = vi.fn();

    const { rerender } = render(
      <SandpackValidationController
        status={status}
        projectFiles={projectFiles}
        onReportSubmitted={onReportSubmitted}
      />,
    );

    rerender(
      <SandpackValidationController
        status={{ ...status, durations: { totalMs: 10, stages: {} } }}
        projectFiles={projectFiles}
        onReportSubmitted={() => onReportSubmitted()}
      />,
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(() => {
      expect(submitSandboxValidation).toHaveBeenCalledTimes(1);
    });

    expect(onReportSubmitted).toHaveBeenCalledTimes(1);
    expect(usePreviewStore.getState().reportSubmitted).toBe(true);
  });
});
