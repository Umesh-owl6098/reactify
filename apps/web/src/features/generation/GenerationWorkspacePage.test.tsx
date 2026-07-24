import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { GenerationWorkspacePage } from "./GenerationWorkspacePage";
import { useGenerationStore } from "./generationStore";

const loadGeneration = vi.fn();
const beginGeneration = vi.fn();
const resumePolling = vi.fn();
const reset = vi.fn();

vi.mock("./useGeneration", () => ({
  useGeneration: () => ({
    generationId: useGenerationStore.getState().generationId,
    status: useGenerationStore.getState().status,
    error: useGenerationStore.getState().error,
    isLoading: useGenerationStore.getState().isLoading,
    isPolling: useGenerationStore.getState().isPolling,
    beginGeneration,
    loadGeneration,
    resumePolling,
    reset,
  }),
}));

vi.mock("../jobs", () => ({
  JobStatus: () => null,
  useJob: () => ({ job: null, refresh: vi.fn() }),
  useGenerationJobs: vi.fn(),
  useJobStore: (selector: (state: { activeJobId: string | null }) => unknown) =>
    selector({ activeJobId: null }),
}));

vi.mock("../upload/ImagePreview", () => ({
  ImagePreview: () => null,
}));

function createFailedStatus(): GenerationStatusResponse {
  return {
    id: "49189210-714d-431d-ac1c-1554c8cf4c74",
    imageId: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    status: "Failed",
    activeStage: "design_analysis",
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: null,
    },
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
    manualRetryAllowed: true,
    retryAllowed: true,
    errors: [
      {
        stage: "design_analysis",
        code: "JOB_NOT_FOUND",
        message: "The background job for this step was never created.",
      },
    ],
    durations: { totalMs: 0, stages: {} },
  };
}

describe("GenerationWorkspacePage", () => {
  beforeEach(() => {
    loadGeneration.mockReset();
    beginGeneration.mockReset();
    resumePolling.mockReset();
    reset.mockReset();
    useGenerationStore.setState({
      generationId: null,
      status: null,
      error: null,
      isLoading: false,
      isPolling: false,
    });
  });

  it("renders loading state instead of a blank page", () => {
    useGenerationStore.setState({
      generationId: "49189210-714d-431d-ac1c-1554c8cf4c74",
      isLoading: true,
      status: null,
      error: null,
    });

    render(
      <MemoryRouter>
        <GenerationWorkspacePage generationId="49189210-714d-431d-ac1c-1554c8cf4c74" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading generation details…")).toBeInTheDocument();
    expect(screen.queryByText("Generation pipeline")).not.toBeInTheDocument();
  });

  it("renders failed generation pipeline state", () => {
    useGenerationStore.setState({
      generationId: "49189210-714d-431d-ac1c-1554c8cf4c74",
      status: createFailedStatus(),
      error: null,
      isLoading: false,
      isPolling: false,
    });

    render(
      <MemoryRouter>
        <GenerationWorkspacePage generationId="49189210-714d-431d-ac1c-1554c8cf4c74" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Generation pipeline")).toBeInTheDocument();
    expect(screen.getByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("The background design job was not available.")).toBeInTheDocument();
  });

  it("renders API error state with retry", () => {
    useGenerationStore.setState({
      generationId: "49189210-714d-431d-ac1c-1554c8cf4c74",
      status: null,
      error: "Generation not found.",
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <GenerationWorkspacePage generationId="49189210-714d-431d-ac1c-1554c8cf4c74" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Unable to load generation")).toBeInTheDocument();
    expect(screen.getByText("Generation not found.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(loadGeneration).toHaveBeenCalledWith("49189210-714d-431d-ac1c-1554c8cf4c74");
  });

  it("does not return null when generation is undefined after loading", () => {
    useGenerationStore.setState({
      generationId: "49189210-714d-431d-ac1c-1554c8cf4c74",
      status: null,
      error: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <GenerationWorkspacePage generationId="49189210-714d-431d-ac1c-1554c8cf4c74" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Unexpected loading error.")).toBeInTheDocument();
  });
});
