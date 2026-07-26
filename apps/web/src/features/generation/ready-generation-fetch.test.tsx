import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { fetchEditHistory, fetchVisualComparisonHistory } from "../../lib/generation-api";
import { useProjectEditStore } from "../project-edit/projectEditStore";
import { useVisualComparisonStore } from "../visual-comparison/visualComparisonStore";
import { useProjectEdit } from "../project-edit/useProjectEdit";
import { useVisualComparison } from "../visual-comparison/useVisualComparison";

vi.mock("../../lib/generation-api", () => ({
  fetchEditHistory: vi.fn(),
  fetchVisualComparisonHistory: vi.fn(),
  createProjectEdit: vi.fn(),
  submitEditClarification: vi.fn(),
  confirmProjectEdit: vi.fn(),
  createVisualComparison: vi.fn(),
  submitVisualComparisonScreenshot: vi.fn(),
  applyVisualCorrection: vi.fn(),
}));

function createReadyStatus(): GenerationStatusResponse {
  return {
    id: "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba",
    imageId: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: {
        projectName: "SuspensionBridgeLandscape",
        summary: "Landing page",
        schemaVersion: "1",
        responseVersion: "1.0.0",
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        components: [],
        files: [{ path: "src/App.tsx", purpose: "Root component", language: "tsx", sizeBytes: 48 }],
        entryFile: "src/main.tsx",
        warnings: [],
      },
    },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: {
      projectHash: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    projectHash: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
    editedByUser: false,
    confirmedAt: new Date().toISOString(),
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: false,
    repair: null,
    exportAllowed: true,
    exportBlockedReason: null,
    latestExportSummary: null,
    editAllowed: true,
    editBlockedReason: null,
    activeEditId: null,
    activeEditStatus: null,
    clarificationRequired: false,
    clarificationQuestion: null,
    latestEditSummary: null,
    activeVersionId: "5cfb85a2a232b35cde9ca40212df0142678cfa23226aa3d0049f6b844b5e6101",
    activeVersionNumber: 1,
    sandboxRevalidationRequired: false,
    visualComparisonAllowed: true,
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

describe("Ready generation fetch loops", () => {
  beforeEach(() => {
    vi.mocked(fetchEditHistory).mockResolvedValue({ generationId: createReadyStatus().id, edits: [] });
    vi.mocked(fetchVisualComparisonHistory).mockResolvedValue({
      generationId: createReadyStatus().id,
      comparisons: [],
    });
    useProjectEditStore.getState().reset();
    useVisualComparisonStore.getState().reset();
    vi.clearAllMocks();
  });

  it("loads edit history only once on initial Ready render", async () => {
    const onRefreshStatus = vi.fn();
    const status = createReadyStatus();

    const { rerender } = renderHook(
      ({ nextStatus }) => useProjectEdit(nextStatus, onRefreshStatus),
      { initialProps: { nextStatus: status } },
    );

    await waitFor(() => {
      expect(fetchEditHistory).toHaveBeenCalledTimes(1);
    });

    rerender({ nextStatus: { ...status, durations: { totalMs: 100, stages: {} } } });
    rerender({ nextStatus: { ...status, durations: { totalMs: 200, stages: {} } } });
    rerender({ nextStatus: { ...status, durations: { totalMs: 300, stages: {} } } });

    await waitFor(() => {
      expect(fetchEditHistory).toHaveBeenCalledTimes(1);
    });
  });

  it("loads visual comparison history only once on initial Ready render", async () => {
    const onRefreshStatus = vi.fn();
    const status = createReadyStatus();

    const { rerender } = renderHook(
      ({ nextStatus }) => useVisualComparison(nextStatus, onRefreshStatus),
      { initialProps: { nextStatus: status } },
    );

    await waitFor(() => {
      expect(fetchVisualComparisonHistory).toHaveBeenCalledTimes(1);
    });

    rerender({ nextStatus: { ...status, latestSimilarityScore: 91.2 } });
    rerender({ nextStatus: { ...status, latestSimilarityScore: 92.4 } });
    rerender({ nextStatus: { ...status, latestSimilarityScore: 93.1 } });

    await waitFor(() => {
      expect(fetchVisualComparisonHistory).toHaveBeenCalledTimes(1);
    });
  });

  it("refetches edit history when explicitly requested after an edit completes", async () => {
    const onRefreshStatus = vi.fn();
    const status = createReadyStatus();

    const { result } = renderHook(() => useProjectEdit(status, onRefreshStatus));

    await waitFor(() => {
      expect(fetchEditHistory).toHaveBeenCalledTimes(1);
    });

    await result.current.loadHistory(true);

    expect(fetchEditHistory).toHaveBeenCalledTimes(2);
  });

  it("keeps edit and comparison requests stable across 120 poll rerenders", async () => {
    const onRefreshStatus = vi.fn();
    const status = createReadyStatus();

    const editHook = renderHook(
      ({ nextStatus }) => useProjectEdit(nextStatus, onRefreshStatus),
      { initialProps: { nextStatus: status } },
    );
    const comparisonHook = renderHook(
      ({ nextStatus }) => useVisualComparison(nextStatus, onRefreshStatus),
      { initialProps: { nextStatus: status } },
    );

    await waitFor(() => {
      expect(fetchEditHistory).toHaveBeenCalledTimes(1);
      expect(fetchVisualComparisonHistory).toHaveBeenCalledTimes(1);
    });

    for (let tick = 0; tick < 120; tick += 1) {
      const nextStatus = {
        ...status,
        durations: { totalMs: tick * 1000, stages: { design_analysis: tick * 100 } },
        latestSimilarityScore: tick,
      };
      editHook.rerender({ nextStatus });
      comparisonHook.rerender({ nextStatus });
    }

    expect(fetchEditHistory).toHaveBeenCalledTimes(1);
    expect(fetchVisualComparisonHistory).toHaveBeenCalledTimes(1);
  });
});
