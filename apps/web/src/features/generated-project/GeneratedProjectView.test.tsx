import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { generatedProjectFixture } from "@reactify/test-utils";
import { fetchGeneratedFileContent, fetchGeneratedProjectFiles } from "../../lib/generation-api";
import { GeneratedProjectView } from "./GeneratedProjectView";

vi.mock("../../lib/generation-api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/generation-api")>("../../lib/generation-api");
  return {
    ...actual,
    fetchGeneratedFileContent: vi.fn(),
    fetchGeneratedProjectFiles: vi.fn(),
  };
});

vi.mock("@codesandbox/sandpack-react", () => ({
  SandpackProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SandpackLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SandpackPreview: () => <div>Sandpack preview</div>,
  useSandpack: () => ({
    sandpack: {
      status: "idle",
      error: null,
    },
  }),
}));

const status: GenerationStatusResponse = {
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
  project: {
    provider: "mock",
    model: "mock-model-v1",
    promptVersion: "1.0.0",
    schemaVersion: "1",
    inputTokens: 100,
    outputTokens: 500,
    latencyMs: 50,
    temperature: 0.2,
    generatedAt: "2026-01-01T00:00:00.000Z",
  },
  schemaValidation: { valid: true, errors: [] },
  staticValidation: { valid: true, errors: [], warnings: [] },
  sandboxValidation: {
    projectHash: "abc123",
    compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
    runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
    validatedAt: "2026-01-01T00:00:00.000Z",
  },
  projectHash: "abc123",
  editedByUser: false,
  confirmedAt: "2026-01-01T00:00:00.000Z",
  awaitingPlanConfirmation: false,
  awaitingSandboxValidation: false,
  featureFlags: { enableGenerationPlanEditing: true },
  errors: [],
  durations: { totalMs: 0, stages: {} },
};

describe("GeneratedProjectView", () => {
  beforeEach(() => {
    vi.mocked(fetchGeneratedFileContent).mockResolvedValue({
      path: "src/App.tsx",
      language: "tsx",
      content: generatedProjectFixture.files.find((file) => file.path === "src/App.tsx")!.content,
    });
    vi.mocked(fetchGeneratedProjectFiles).mockResolvedValue({
      generationId: status.id,
      files: generatedProjectFixture.files.map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
        sizeBytes: file.content.length,
      })),
    });
  });

  it("renders summary, file tree, and preview ready notice", () => {
    render(<GeneratedProjectView status={status} onValidationReportSubmitted={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Generated source code" })).toBeInTheDocument();
    expect(screen.getByText(generatedProjectFixture.projectName)).toBeInTheDocument();
    expect(screen.getByLabelText("Open file src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText(/Preview ready/)).toBeInTheDocument();
  });

  it("loads and displays selected file content", async () => {
    render(<GeneratedProjectView status={status} onValidationReportSubmitted={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Open file src/App.tsx"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "src/App.tsx" })).toBeInTheDocument();
    });
  });

  it("shows validation results and component summary", () => {
    render(<GeneratedProjectView status={status} onValidationReportSubmitted={() => undefined} />);
    expect(screen.getByText(/Schema validation/)).toBeInTheDocument();
    expect(screen.getByText(/Static validation/)).toBeInTheDocument();
    expect(screen.getByText(/Sandbox validation/)).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });
});
