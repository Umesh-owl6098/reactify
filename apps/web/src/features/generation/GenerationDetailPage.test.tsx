import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { GenerationDetailPage } from "./GenerationDetailPage";
import * as generationApi from "../../lib/generation-api";

const generationId = "49189210-714d-431d-ac1c-1554c8cf4c74";

function createFailedStatus(): GenerationStatusResponse {
  return {
    id: generationId,
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

function createAnalyzingStatus(): GenerationStatusResponse {
  return {
    ...createFailedStatus(),
    status: "Analyzing",
    errors: [],
    retryAllowed: false,
    manualRetryAllowed: false,
  };
}

describe("GenerationDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading then failed generation state", async () => {
    vi.spyOn(generationApi, "fetchGenerationStatus").mockResolvedValue(createFailedStatus());

    render(
      <MemoryRouter>
        <GenerationDetailPage generationId={generationId} />
      </MemoryRouter>,
    );

    expect(screen.getByText("Loading generation details…")).toBeInTheDocument();
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByText("Back to history")).toBeInTheDocument();
  });

  it("renders analyzing generation state", async () => {
    vi.spyOn(generationApi, "fetchGenerationStatus").mockResolvedValue(createAnalyzingStatus());

    render(
      <MemoryRouter>
        <GenerationDetailPage generationId={generationId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Analyzing screenshot")).toBeInTheDocument();
    expect(screen.getByText("Generation pipeline")).toBeInTheDocument();
  });

  it("renders API error without crashing", async () => {
    vi.spyOn(generationApi, "fetchGenerationStatus").mockRejectedValue(
      new generationApi.GenerationApiRequestError("Generation not found.", "GENERATION_NOT_FOUND", 404),
    );

    render(
      <MemoryRouter>
        <GenerationDetailPage generationId={generationId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Unable to load generation")).toBeInTheDocument();
    expect(screen.getByText("Generation not found.")).toBeInTheDocument();
  });
});
