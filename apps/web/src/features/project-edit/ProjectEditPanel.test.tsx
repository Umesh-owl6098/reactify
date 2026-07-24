import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { visualComparisonPollingDefaults } from "../../test/visualComparisonPollingDefaults";
import { ProjectEditPanel } from "./ProjectEditPanel";

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
  editAllowed: true,
  editBlockedReason: null,
  activeEditId: null,
  activeEditStatus: null,
  clarificationRequired: false,
  clarificationQuestion: null,
  latestEditSummary: null,
  activeVersionId: "abc123",
  activeVersionNumber: 1,
  sandboxRevalidationRequired: false,
  ...visualComparisonPollingDefaults,
  featureFlags: { enableGenerationPlanEditing: true },
  manualRetryAllowed: false,
  retryAllowed: false,
  errors: [],
  durations: { totalMs: 0, stages: {} },
} as GenerationStatusResponse;

describe("ProjectEditPanel", () => {
  it("renders the edit instruction input when editing is allowed", () => {
    render(<ProjectEditPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    expect(screen.getByLabelText("Edit instruction")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit AI edit" })).toBeDisabled();
  });

  it("shows blocked reason when editing is unavailable", () => {
    render(
      <ProjectEditPanel
        status={{ ...baseStatus, editAllowed: false, editBlockedReason: "repair_in_progress" }}
        onRefreshStatus={() => undefined}
      />,
    );
    expect(screen.getByText(/repair in progress/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit AI edit" })).toBeDisabled();
  });
});
