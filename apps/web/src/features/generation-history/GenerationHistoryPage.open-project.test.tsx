import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { GenerationHistoryPage } from "./GenerationHistoryPage";
import { GenerationWorkspacePage } from "../generation/GenerationWorkspacePage";
import * as generationApi from "../../lib/generation-api";

const failedGenerationId = "49189210-714d-431d-ac1c-1554c8cf4c74";
const analyzingGenerationId = "22222222-2222-4222-8222-222222222222";

function createFailedStatus(id: string): GenerationStatusResponse {
  return {
    id,
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

function createAnalyzingStatus(id: string): GenerationStatusResponse {
  return {
    ...createFailedStatus(id),
    status: "Analyzing",
    activeStage: "design_analysis",
    errors: [],
    retryAllowed: false,
    manualRetryAllowed: false,
  };
}

vi.mock("./useGenerationHistory", () => ({
  useGenerationHistory: () => ({
    items: [
      {
        generationId: failedGenerationId,
        status: "Failed",
        sourceImageFilename: "failed.png",
        currentStage: "design_analysis",
        activeVersionNumber: null,
        latestProjectHash: null,
        latestSimilarityScore: null,
        repairCount: 0,
        editCount: 0,
        versionCount: 1,
        exportCount: 0,
        createdAt: "2026-07-23T12:00:00.000Z",
        updatedAt: "2026-07-23T12:30:00.000Z",
      },
      {
        generationId: analyzingGenerationId,
        status: "Analyzing",
        sourceImageFilename: "analyzing.png",
        currentStage: "design_analysis",
        activeVersionNumber: null,
        latestProjectHash: null,
        latestSimilarityScore: null,
        repairCount: 0,
        editCount: 0,
        versionCount: 1,
        exportCount: 0,
        createdAt: "2026-07-23T13:00:00.000Z",
        updatedAt: "2026-07-23T13:05:00.000Z",
      },
    ],
    total: 2,
    limit: 20,
    offset: 0,
    statusFilter: "",
    isLoading: false,
    error: null,
    setPagination: vi.fn(),
    setStatusFilter: vi.fn(),
    reload: vi.fn(),
  }),
}));

vi.mock("../auth/useSession", () => ({
  useSession: () => ({
    isAuthenticated: true,
    isInitialized: true,
    isLoading: false,
    sessionError: null,
    user: {
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@example.com",
      displayName: "Test User",
      createdAt: new Date().toISOString(),
    },
    sessionExpiresAt: null,
    restoreSession: vi.fn(),
    completeSignIn: vi.fn(),
    clear: vi.fn(),
  }),
}));

const resetJobs = vi.fn();

vi.mock("../jobs", () => ({
  JobStatus: () => null,
  useJob: () => ({ job: null, refresh: vi.fn() }),
  useGenerationJobs: vi.fn(),
  useJobStore: (selector: (state: { activeJobId: string | null; reset: () => void }) => unknown) =>
    selector({ activeJobId: null, reset: resetJobs }),
}));

vi.mock("../upload/ImagePreview", () => ({
  ImagePreview: () => null,
}));

function RoutedWorkspace() {
  const { generationId } = useParams<{ generationId: string }>();
  return <GenerationWorkspacePage key={generationId} generationId={generationId} />;
}

describe("GenerationHistoryPage open project flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("navigates to the exact generationId from history cards", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<GenerationHistoryPage />} />
          <Route path="/generations/:generationId" element={<RoutedWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );

    const openProjectLinks = screen.getAllByRole("link", { name: "Open Project" });
    expect(openProjectLinks[0]).toHaveAttribute("href", `/generations/${failedGenerationId}`);
    expect(openProjectLinks[1]).toHaveAttribute("href", `/generations/${analyzingGenerationId}`);
  });

  it("loads failed then analyzing generations without leaving a blank shell", async () => {
    vi.spyOn(generationApi, "fetchGenerationStatus")
      .mockResolvedValueOnce(createFailedStatus(failedGenerationId))
      .mockResolvedValueOnce(createAnalyzingStatus(analyzingGenerationId));

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<GenerationHistoryPage />} />
          <Route path="/generations/:generationId" element={<RoutedWorkspace />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole("link", { name: "Open Project" })[0]!);

    await waitFor(() => {
      expect(generationApi.fetchGenerationStatus).toHaveBeenCalledWith(failedGenerationId);
    });
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Back to history" }));
    fireEvent.click(screen.getAllByRole("link", { name: "Open Project" })[1]!);

    await waitFor(() => {
      expect(generationApi.fetchGenerationStatus).toHaveBeenCalledWith(analyzingGenerationId);
    });
    expect(await screen.findByText("Analyzing screenshot")).toBeInTheDocument();
    expect(screen.getByText("Generation pipeline")).toBeInTheDocument();
  });
});
