import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { visualComparisonPollingDefaults } from "../../test/visualComparisonPollingDefaults";
import { ExportProjectPanel } from "./ExportProjectButton";
import { createProjectExport, downloadProjectExport, fetchExportHistory, GenerationApiRequestError } from "../../lib/generation-api";
import { useExportStore } from "./exportStore";

vi.mock("../../lib/generation-api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/generation-api")>("../../lib/generation-api");
  return {
    ...actual,
    createProjectExport: vi.fn(),
    downloadProjectExport: vi.fn(),
    fetchExportHistory: vi.fn().mockResolvedValue({ generationId: "550e8400-e29b-41d4-a716-446655440000", exports: [] }),
  };
});

const baseStatus = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  imageId: "660e8400-e29b-41d4-a716-446655440000",
  projectId: "770e8400-e29b-41d4-a716-446655440000",
  status: "Ready",
  activeStage: null,
  stages: [],
  outputs: {
    designAnalysis: null,
    generationPlan: null,
    generatedProject: {
      schemaVersion: "1",
      responseVersion: "mock-v1",
      projectName: "MockLandingPage",
      summary: "Mock project",
      dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
      devDependencies: { vite: "^6.0.11" },
      files: [{ path: "src/App.tsx", language: "tsx", purpose: "App", sizeBytes: 42 }],
      entryFile: "src/main.tsx",
      components: [{ name: "App", filePath: "src/App.tsx", exported: true, props: [], dependencies: [], accessibilityNotes: "" }],
      warnings: [],
    },
  },
  analysis: null,
  plan: null,
  project: null,
  schemaValidation: { valid: true, errors: [] },
  staticValidation: { valid: true, errors: [], warnings: [] },
  sandboxValidation: {
    projectHash: "abc123",
    compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
    runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
    validatedAt: new Date().toISOString(),
  },
  projectHash: "abc123",
  editedByUser: false,
  confirmedAt: new Date().toISOString(),
  awaitingPlanConfirmation: false,
  awaitingSandboxValidation: false,
  repair: null,
  exportAllowed: true,
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
  ...visualComparisonPollingDefaults,
  featureFlags: { enableGenerationPlanEditing: true },
  manualRetryAllowed: false,
  retryAllowed: false,
  errors: [],
  durations: { totalMs: 0, stages: {} },
} as GenerationStatusResponse;

describe("ExportProjectPanel", () => {
  beforeEach(() => {
    useExportStore.getState().reset();
    vi.clearAllMocks();
    vi.mocked(fetchExportHistory).mockResolvedValue({
      generationId: "550e8400-e29b-41d4-a716-446655440000",
      exports: [],
    });
  });

  it("enables export for valid projects", () => {
    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    expect(screen.getByRole("button", { name: "Export project as ZIP" })).toBeEnabled();
  });

  it("disables export when blocked", () => {
    render(
      <ExportProjectPanel
        status={{ ...baseStatus, exportAllowed: false, exportBlockedReason: "awaiting_sandbox_validation" }}
        onRefreshStatus={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "Export project as ZIP" })).toBeDisabled();
    expect(screen.getByText(/awaiting sandbox validation/i)).toBeInTheDocument();
  });

  it("opens the export dialog", () => {
    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Export project as ZIP" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Optional project name")).toBeInTheDocument();
    expect(within(dialog).getByText(/README, manifest, and generated source files/i)).toBeInTheDocument();
  });

  it("submits export and triggers download flow", async () => {
    vi.mocked(createProjectExport).mockResolvedValue({
      exportId: "880e8400-e29b-41d4-a716-446655440000",
      status: "ready",
      filename: "mock-landing-page-v1.zip",
      projectName: "mock-landing-page",
      generationId: baseStatus.id,
      versionId: baseStatus.projectHash!,
      versionNumber: 1,
      projectHash: baseStatus.projectHash!,
      fileCount: 8,
      totalSizeBytes: 1200,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    });
    vi.mocked(downloadProjectExport).mockResolvedValue(undefined);

    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Export project as ZIP" }));
    fireEvent.click(screen.getByRole("button", { name: "Download ZIP export" }));

    await waitFor(() => {
      expect(createProjectExport).toHaveBeenCalled();
      expect(downloadProjectExport).toHaveBeenCalled();
    });
  });

  it("shows backend export errors in the dialog", async () => {
    vi.mocked(createProjectExport).mockRejectedValue(
      new GenerationApiRequestError(
        "Project hash mismatch detected during integrity verification.",
        "PROJECT_INTEGRITY_FAILED",
      ),
    );

    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Export project as ZIP" }));
    fireEvent.click(screen.getByRole("button", { name: "Download ZIP export" }));

    await waitFor(() => {
      expect(screen.getByText("Export failed: Project hash mismatch detected during integrity verification.")).toBeInTheDocument();
    });
  });

  it("shows download errors from export history without unhandled rejections", async () => {
    vi.mocked(fetchExportHistory).mockResolvedValue({
      generationId: baseStatus.id,
      exports: [
        {
          exportId: "880e8400-e29b-41d4-a716-446655440000",
          status: "ready",
          filename: "mock-landing-page-v1.zip",
          projectName: "mock-landing-page",
          generationId: baseStatus.id,
          versionId: baseStatus.projectHash!,
          versionNumber: 1,
          projectHash: baseStatus.projectHash!,
          fileCount: 8,
          totalSizeBytes: 1200,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        },
      ],
    });
    vi.mocked(downloadProjectExport).mockRejectedValue(
      new GenerationApiRequestError("Export download is not available.", "GENERATION_NOT_FOUND"),
    );

    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Download mock-landing-page-v1.zip again/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Download mock-landing-page-v1.zip again/i }));

    await waitFor(() => {
      expect(screen.getByText(/Download failed: Export download is not available\./i)).toBeInTheDocument();
    });
    expect(downloadProjectExport).toHaveBeenCalledTimes(1);
  });

  it("prevents duplicate submission while submitting", async () => {
    vi.mocked(createProjectExport).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                exportId: "880e8400-e29b-41d4-a716-446655440000",
                status: "ready",
                filename: "mock-landing-page-v1.zip",
                projectName: "mock-landing-page",
                generationId: baseStatus.id,
                versionId: baseStatus.projectHash!,
                versionNumber: 1,
                projectHash: baseStatus.projectHash!,
                fileCount: 8,
                totalSizeBytes: 1200,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
              }),
            50,
          );
        }),
    );

    render(<ExportProjectPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Export project as ZIP" }));
    const downloadButton = screen.getByRole("button", { name: "Download ZIP export" });
    fireEvent.click(downloadButton);
    fireEvent.click(downloadButton);
    expect(downloadButton).toBeDisabled();

    await waitFor(() => {
      expect(createProjectExport).toHaveBeenCalledTimes(1);
    });
  });
});
