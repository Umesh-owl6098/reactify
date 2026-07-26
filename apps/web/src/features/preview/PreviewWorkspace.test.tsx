import { act, render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { generatedProjectFixture } from "@reactify/test-utils";
import { PreviewWorkspace } from "./PreviewWorkspace";
import { usePreviewStore } from "./previewStore";
import { loadProjectFilesForSandpack } from "./loadProjectFiles";

const submitSandboxValidation = vi.fn();
const sandpackProviderMountCount = vi.fn();

vi.mock("./loadProjectFiles", () => ({
  loadProjectFilesForSandpack: vi.fn(),
}));

vi.mock("../../lib/generation-api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/generation-api")>("../../lib/generation-api");
  return {
    ...actual,
    submitSandboxValidation: (...args: unknown[]) => submitSandboxValidation(...args),
  };
});

vi.mock("@codesandbox/sandpack-react", () => ({
  SandpackProvider: ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
      sandpackProviderMountCount();
    }, []);
    return <div data-testid="sandpack-provider">{children}</div>;
  },
  SandpackLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SandpackPreview: () => <div>Sandpack preview</div>,
  useSandpack: () => ({
    sandpack: {
      status: "idle",
      error: null,
    },
  }),
}));

function createAwaitingValidationStatus(
  overrides: Partial<GenerationStatusResponse> = {},
): GenerationStatusResponse {
  return {
    id: "a32f38cc-fde0-4379-b6ec-a59e5f13a953",
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
    ...overrides,
  };
}

function cloneStatusWithFreshReferences(status: GenerationStatusResponse): GenerationStatusResponse {
  return {
    ...status,
    outputs: {
      ...status.outputs,
      generatedProject: status.outputs.generatedProject
        ? {
            ...status.outputs.generatedProject,
            files: status.outputs.generatedProject.files.map((file) => ({ ...file })),
            warnings: [...status.outputs.generatedProject.warnings],
            components: status.outputs.generatedProject.components.map((component) => ({ ...component })),
          }
        : null,
    },
    durations: {
      totalMs: status.durations.totalMs + 1,
      stages: { ...status.durations.stages },
    },
  };
}

describe("PreviewWorkspace", () => {
  beforeEach(() => {
    sandpackProviderMountCount.mockReset();
    submitSandboxValidation.mockReset();
    submitSandboxValidation.mockResolvedValue("Ready");
    vi.mocked(loadProjectFilesForSandpack).mockClear();
    usePreviewStore.getState().reset();
    vi.mocked(loadProjectFilesForSandpack).mockResolvedValue({
      files: generatedProjectFixture.files.map((file) => ({
        path: file.path,
        content: file.content,
      })),
      compiledStylesheet: ".grid{display:grid}.min-h-screen{min-height:100vh}",
    });
  });

  it("mounts Sandpack once and loads project files once across polling-style status updates", async () => {
    const initialStatus = createAwaitingValidationStatus();
    const { rerender } = render(
      <PreviewWorkspace status={initialStatus} onValidationReportSubmitted={() => undefined} />,
    );

    await waitFor(() => {
      expect(loadProjectFilesForSandpack).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      rerender(
        <PreviewWorkspace
          status={cloneStatusWithFreshReferences(initialStatus)}
          onValidationReportSubmitted={() => undefined}
        />,
      );
      rerender(
        <PreviewWorkspace
          status={cloneStatusWithFreshReferences(initialStatus)}
          onValidationReportSubmitted={() => undefined}
        />,
      );
      rerender(
        <PreviewWorkspace
          status={cloneStatusWithFreshReferences(initialStatus)}
          onValidationReportSubmitted={() => undefined}
        />,
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(loadProjectFilesForSandpack).toHaveBeenCalledTimes(1);
    expect(sandpackProviderMountCount).toHaveBeenCalledTimes(1);
  });

  it("loads Sandpack files for Ready generations with sandbox validation", async () => {
    const readyStatus = createAwaitingValidationStatus({
      status: "Ready",
      awaitingSandboxValidation: false,
      sandboxValidation: {
        projectHash: "6c4063241b31f64168b6f142e4dc43dbbec8dc050251deb31d13a99f43468161",
        compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
        runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
        validatedAt: new Date().toISOString(),
      },
    });

    render(<PreviewWorkspace status={readyStatus} onValidationReportSubmitted={() => undefined} />);

    await waitFor(() => {
      expect(loadProjectFilesForSandpack).toHaveBeenCalledTimes(1);
    });
  });

  it("completes browser validation once after Sandpack mounts", async () => {
    const status = createAwaitingValidationStatus();

    render(<PreviewWorkspace status={status} onValidationReportSubmitted={() => undefined} />);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
    });

    await waitFor(() => {
      expect(submitSandboxValidation).toHaveBeenCalledTimes(1);
    });
    expect(usePreviewStore.getState().reportSubmitted).toBe(true);
  });
});
