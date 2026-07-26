import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { resolveGenerationWorkspaceView } from "./generation-workspace-view";

const generationId = "49189210-714d-431d-ac1c-1554c8cf4c74";

function createStatus(overrides: Partial<GenerationStatusResponse> = {}): GenerationStatusResponse {
  return {
    id: generationId,
    imageId: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    status: "Analyzing",
    activeStage: "design_analysis",
    stages: [],
    outputs: { designAnalysis: null, generationPlan: null, generatedProject: null },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: null,
    staticValidation: null,
    sandboxValidation: null,
    projectHash: null,
    editedByUser: false,
    confirmedAt: null,
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: false,
    repair: null,
    exportAllowed: false,
    exportBlockedReason: null,
    latestExportSummary: null,
    editAllowed: false,
    editBlockedReason: null,
    activeEditId: null,
    activeEditStatus: null,
    clarificationRequired: false,
    clarificationQuestion: null,
    latestEditSummary: null,
    activeVersionId: null,
    activeVersionNumber: null,
    sandboxRevalidationRequired: false,
    visualComparisonAllowed: false,
    visualComparisonBlockedReason: null,
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
    ...overrides,
  };
}

describe("resolveGenerationWorkspaceView", () => {
  it("returns upload when no generation id is provided", () => {
    expect(
      resolveGenerationWorkspaceView({
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null,
        status: null,
      }),
    ).toBe("upload");
  });

  it("returns loading for stale status from another generation", () => {
    expect(
      resolveGenerationWorkspaceView({
        generationId,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null,
        status: createStatus({ id: "11111111-1111-4111-8111-111111111111" }),
      }),
    ).toBe("loading");
  });

  it("returns ready when the route status matches", () => {
    expect(
      resolveGenerationWorkspaceView({
        generationId,
        isAuthenticated: true,
        isInitialized: true,
        isLoading: false,
        error: null,
        status: createStatus({ status: "Planning", awaitingPlanConfirmation: true }),
      }),
    ).toBe("ready");
  });
});
