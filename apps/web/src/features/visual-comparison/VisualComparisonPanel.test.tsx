import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { visualComparisonPollingDefaults } from "../../test/visualComparisonPollingDefaults";
import { VisualComparisonPanel } from "./VisualComparisonPanel";

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
    projectHash: "hash",
    compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
    runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
    validatedAt: new Date().toISOString(),
  },
  projectHash: "hash",
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
  activeVersionId: "hash",
  activeVersionNumber: 1,
  sandboxRevalidationRequired: false,
  ...visualComparisonPollingDefaults,
  visualComparisonAllowed: true,
  featureFlags: { enableGenerationPlanEditing: true },
  manualRetryAllowed: false,
  retryAllowed: false,
  errors: [],
  durations: { totalMs: 0, stages: {} },
} as GenerationStatusResponse;

describe("VisualComparisonPanel", () => {
  it("renders compare action and score labels", () => {
    render(<VisualComparisonPanel status={baseStatus} onRefreshStatus={() => undefined} />);
    expect(screen.getByRole("button", { name: "Compare with Original" })).toBeInTheDocument();
    expect(screen.getByText("Compare with Original", { selector: "h2" })).toBeInTheDocument();
  });

  it("shows blocked reason when comparison is unavailable", () => {
    render(
      <VisualComparisonPanel
        status={{
          ...baseStatus,
          visualComparisonAllowed: false,
          visualComparisonBlockedReason: "preview_not_ready",
        }}
        onRefreshStatus={() => undefined}
      />,
    );
    expect(screen.getByText(/preview not ready/i)).toBeInTheDocument();
  });
});
