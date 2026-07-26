import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { App } from "./App";
import * as authApi from "../features/auth/authApi";
import * as generationApi from "../lib/generation-api";
import { useAuthStore } from "../features/auth/authStore";
import { resetInitialSessionRestoreFlag } from "../features/auth/session-restore";
import { useGenerationStore } from "../features/generation/generationStore";

const generationId = "49189210-714d-431d-ac1c-1554c8cf4c74";

const testUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@example.com",
  displayName: "Test User",
  createdAt: new Date().toISOString(),
};

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

const resetJobs = vi.fn();

vi.mock("../features/jobs", () => ({
  JobStatus: () => null,
  useJob: () => ({ job: null, refresh: vi.fn() }),
  useGenerationJobs: vi.fn(),
  useJobStore: (selector: (state: { activeJobId: string | null; reset: () => void }) => unknown) =>
    selector({ activeJobId: null, reset: resetJobs }),
}));

vi.mock("../features/upload/ImagePreview", () => ({
  ImagePreview: () => null,
}));

vi.mock("../features/generation-history/useGenerationHistory", () => ({
  useGenerationHistory: () => ({
    items: [],
    total: 0,
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

describe("App sign-in redirect flow", () => {
  beforeEach(() => {
    resetInitialSessionRestoreFlag();
    useAuthStore.setState({
      user: null,
      sessionExpiresAt: null,
      isInitialized: false,
      isLoading: false,
      sessionStatus: "unknown",
      sessionError: null,
    });
    useGenerationStore.getState().reset();
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated users to sign-in and returns after successful sign-in", async () => {
    vi.spyOn(authApi, "fetchSession").mockResolvedValue({ authenticated: false });
    vi.spyOn(authApi, "signInAccount").mockResolvedValue({ user: testUser });
    vi.spyOn(generationApi, "fetchGenerationStatus").mockResolvedValue(createFailedStatus());

    render(
      <MemoryRouter initialEntries={[`/generations/${generationId}`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(generationApi.fetchGenerationStatus).toHaveBeenCalledWith(generationId);
    });
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reactify" })).toBeInTheDocument();
  });

  it("preserves the generation return-to URL after sign-in", async () => {
    vi.spyOn(authApi, "fetchSession").mockResolvedValue({ authenticated: false });
    vi.spyOn(authApi, "signInAccount").mockResolvedValue({ user: testUser });
    vi.spyOn(generationApi, "fetchGenerationStatus").mockResolvedValue(createFailedStatus());

    render(
      <MemoryRouter initialEntries={[`/generations/${generationId}?tab=jobs#details`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(generationApi.fetchGenerationStatus).toHaveBeenCalledWith(generationId);
    });
  });

  it("renders authenticated generation routes from the initial session", async () => {
    vi.spyOn(authApi, "fetchSession").mockResolvedValue({ authenticated: true, user: testUser });
    vi.spyOn(generationApi, "fetchGenerationStatus").mockResolvedValue(createFailedStatus());

    render(
      <MemoryRouter initialEntries={[`/generations/${generationId}`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Reactify" })).toBeInTheDocument();
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
  });

  it("does not let a stale unauthenticated session restore clear a completed sign-in", async () => {
    let resolveSession: ((value: Awaited<ReturnType<typeof authApi.fetchSession>>) => void) | undefined;
    const pendingSession = new Promise<Awaited<ReturnType<typeof authApi.fetchSession>>>((resolve) => {
      resolveSession = resolve;
    });

    vi.spyOn(authApi, "fetchSession").mockReturnValue(pendingSession);
    vi.spyOn(authApi, "signInAccount").mockResolvedValue({ user: testUser });

    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe("user@example.com");
    });

    resolveSession?.({ authenticated: false });

    await waitFor(() => {
      expect(useAuthStore.getState().user?.email).toBe("user@example.com");
    });
    expect(await screen.findByText("Project history")).toBeInTheDocument();
  });

  it("reloads generation data after authentication even when a prior load failed", async () => {
    useGenerationStore.setState({
      generationId,
      status: null,
      error: "Authentication required.",
      isLoading: false,
      isPolling: false,
    });

    vi.spyOn(authApi, "fetchSession").mockResolvedValue({ authenticated: false });
    vi.spyOn(authApi, "signInAccount").mockResolvedValue({ user: testUser });
    const fetchGenerationStatus = vi
      .spyOn(generationApi, "fetchGenerationStatus")
      .mockResolvedValue(createFailedStatus());

    render(
      <MemoryRouter initialEntries={[`/generations/${generationId}`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "user@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: "secure-password-123" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(fetchGenerationStatus).toHaveBeenCalledWith(generationId);
    });
    expect(await screen.findByText("Generation failed")).toBeInTheDocument();
  });
});
