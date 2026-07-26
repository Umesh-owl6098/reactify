import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { PipelineStatus } from "./PipelineStatus.js";

function createAnalyzingStatus(): GenerationStatusResponse {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    imageId: "33333333-3333-4333-8333-333333333333",
    projectId: "44444444-4444-4444-8444-444444444444",
    status: "Analyzing",
    activeStage: null,
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
    manualRetryAllowed: false,
    retryAllowed: false,
    errors: [],
    durations: { totalMs: 0, stages: {} },
  };
}

describe("PipelineStatus", () => {
  it("shows queued design analysis instead of active analyzing copy", () => {
    render(
      <PipelineStatus
        status={createAnalyzingStatus()}
        isPolling
        error={null}
        job={{
          jobId: "11111111-1111-4111-8111-111111111111",
          generationId: "22222222-2222-4222-8222-222222222222",
          jobType: "design_analysis",
          status: "queued",
          progress: 0,
          progressMessage: "Waiting for worker",
          attemptNumber: 1,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          startedAt: null,
          completedAt: null,
          failureCode: null,
          failureMessage: null,
          cancellationAllowed: true,
        }}
      />,
    );

    expect(screen.getByText("Queued for analysis")).toBeInTheDocument();
    expect(
      screen.queryByText("Claude is extracting layout, tokens, and component hierarchy from your upload."),
    ).not.toBeInTheDocument();
  });

  it("shows provider-not-configured failure from the active job", () => {
    render(
      <PipelineStatus
        status={createAnalyzingStatus()}
        isPolling
        error={null}
        job={{
          jobId: "11111111-1111-4111-8111-111111111111",
          generationId: "22222222-2222-4222-8222-222222222222",
          jobType: "design_analysis",
          status: "failed",
          progress: 0,
          progressMessage: null,
          attemptNumber: 1,
          maxAttempts: 3,
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          failureCode: "AI_PROVIDER_NOT_CONFIGURED",
          failureMessage: "Anthropic is not configured for the worker.",
          cancellationAllowed: false,
        }}
      />,
    );

    expect(screen.getByText("AI provider not configured")).toBeInTheDocument();
    expect(screen.getByText("Anthropic is not configured for the worker.")).toBeInTheDocument();
  });

  it("renders loading feedback instead of returning null", () => {
    render(<PipelineStatus status={null} isLoading isPolling={false} error={null} job={null} />);

    expect(screen.getByText("Loading generation pipeline…")).toBeInTheDocument();
  });

  it("renders failed generation status safely", () => {
    render(
      <PipelineStatus
        status={{
          ...createAnalyzingStatus(),
          status: "Failed",
          errors: [
            {
              stage: "design_analysis",
              code: "JOB_NOT_FOUND",
              message: "The background job for this step was never created.",
            },
          ],
        }}
        isPolling={false}
        error={null}
        job={null}
      />,
    );

    expect(screen.getByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByText("The background design job was not available.")).toBeInTheDocument();
  });

  it("shows retry action when backend allows recovery", () => {
    render(
      <PipelineStatus
        status={{
          ...createAnalyzingStatus(),
          status: "Failed",
          manualRetryAllowed: true,
          retryAllowed: true,
          errors: [
            {
              stage: "design_analysis",
              code: "JOB_NOT_FOUND",
              message: "The background job for this step was never created.",
            },
          ],
        }}
        isPolling={false}
        error={null}
        job={null}
        onRetried={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders analyzing state when no active job is available", () => {
    render(
      <PipelineStatus
        status={createAnalyzingStatus()}
        isLoading={false}
        isPolling={true}
        error={null}
        job={null}
        onRetried={vi.fn()}
      />,
    );

    expect(screen.getByText("Analyzing screenshot")).toBeInTheDocument();
  });
});
