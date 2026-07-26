import { beforeEach, describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isTerminalGenerationStatus } from "../../lib/generation-api";
import { useGenerationStore } from "./generationStore";

function createCompilingStatus(): GenerationStatusResponse {
  return {
    id: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
    imageId: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    status: "Compiling",
    activeStage: "sandbox_compilation",
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: null,
    },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: null,
    projectHash: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
    editedByUser: false,
    confirmedAt: new Date().toISOString(),
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
    activeVersionId: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
    activeVersionNumber: 1,
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
  };
}

function createReadyStatus(): GenerationStatusResponse {
  const compiling = createCompilingStatus();
  return {
    ...compiling,
    status: "Ready",
    activeStage: null,
    awaitingSandboxValidation: false,
    exportAllowed: true,
    exportBlockedReason: null,
    sandboxValidation: {
      projectHash: compiling.projectHash!,
      compilation: { success: true, durationMs: 120, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 120, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
  };
}

describe("generation hydration", () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationId: null,
      status: null,
      error: null,
      isLoading: false,
      isPolling: false,
      loadRequestId: 0,
    });
  });

  it("replaces cached Compiling status when the backend becomes Ready", () => {
    const generationId = "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";
    useGenerationStore.setState({
      generationId,
      status: createCompilingStatus(),
      isLoading: false,
      isPolling: true,
      error: "Generation polling failed.",
    });

    const readyStatus = createReadyStatus();
    useGenerationStore.getState().setStatus(readyStatus);
    useGenerationStore.getState().setError(null);
    useGenerationStore.getState().setPolling(!isTerminalGenerationStatus(readyStatus.status));

    const status = useGenerationStore.getState().status;
    expect(status?.status).toBe("Ready");
    expect(status?.awaitingSandboxValidation).toBe(false);
    expect(useGenerationStore.getState().error).toBeNull();
    expect(useGenerationStore.getState().isPolling).toBe(false);
  });

  it("invalidates in-flight loads when beginGenerationLoad bumps the request id", () => {
    const generationId = "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";
    useGenerationStore.getState().beginGenerationLoad(generationId);
    const firstRequestId = useGenerationStore.getState().loadRequestId;

    useGenerationStore.getState().beginGenerationLoad("924ae008-db1d-44ed-97b7-2019de8b6bf4");
    const secondRequestId = useGenerationStore.getState().loadRequestId;

    expect(secondRequestId).toBeGreaterThan(firstRequestId);
    expect(useGenerationStore.getState().generationId).toBe("924ae008-db1d-44ed-97b7-2019de8b6bf4");
    expect(useGenerationStore.getState().status).toBeNull();
  });
});
