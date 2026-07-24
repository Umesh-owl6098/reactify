import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RepairStatusSnapshot } from "@reactify/generation-contracts";
import { RepairStatusPanel } from "./RepairStatus";
import { RepairChangedFiles } from "./RepairChangedFiles";
import { RepairDiagnostics } from "./RepairDiagnostics";

const repairSnapshot: RepairStatusSnapshot = {
  repairRequired: true,
  repairStatus: "waiting_for_revalidation",
  currentAttempt: 1,
  maxAttempts: 3,
  manualRetryAllowed: false,
  clientRevalidationRequired: true,
  latestPatchSummary: "Fix App export",
  changedFiles: ["src/App.tsx"],
  deletedFiles: [],
  dependencyChanges: [],
  unresolvedRisks: ["Runtime behavior not fully verified"],
  latestDiagnostics: [
    {
      code: "SYNTAX",
      message: "Unexpected token",
      severity: "error",
      source: "sandpack",
      category: "syntax",
    },
  ],
  repairHistory: [
    {
      attemptNumber: 1,
      status: "waiting_for_revalidation",
      patchSummary: "Fix App export",
      changedFileCount: 1,
    },
  ],
};

describe("repair UI", () => {
  it("renders repair progress and attempt number", () => {
    render(<RepairStatusPanel repair={repairSnapshot} />);
    expect(screen.getByText("Revalidating preview")).toBeInTheDocument();
    expect(screen.getByText(/Attempt 1 of 3/)).toBeInTheDocument();
  });

  it("renders manual retry when allowed", () => {
    render(
      <RepairStatusPanel
        repair={{ ...repairSnapshot, manualRetryAllowed: true, repairStatus: "failed" }}
        onManualRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Retry repair" })).toBeInTheDocument();
  });

  it("renders changed files and diff output", () => {
    render(
      <RepairChangedFiles
        repair={repairSnapshot}
        attemptDetail={{
          generationId: "550e8400-e29b-41d4-a716-446655440000",
          attempt: {
            attemptNumber: 1,
            startedAt: new Date().toISOString(),
            status: "waiting_for_revalidation",
            provider: "mock",
            model: "mock-model-v1",
            promptVersion: "1.0.0",
            inputTokens: 1,
            outputTokens: 1,
            latencyMs: 1,
            diagnosticsBefore: repairSnapshot.latestDiagnostics,
            repairabilityClassification: { repairable: true, reasons: ["Syntax error"] },
            patchSummary: "Fix App export",
            changedFiles: [
              {
                path: "src/App.tsx",
                fullContent: "export default function App(){return <div>fixed</div>}",
                language: "tsx",
                reason: "Fix JSX",
                beforeContent: "export default function App(){return <div>broken</div>}",
                afterContent: "export default function App(){return <div>fixed</div>}",
              },
            ],
            deletedFiles: [],
            dependencyChanges: [],
            projectHashBefore: "abc",
            repeatedPatchDetected: false,
            repeatedDiagnosticsDetected: false,
            unresolvedRisks: ["Runtime behavior not fully verified"],
          },
        }}
      />,
    );

    expect(screen.getByText("src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText(/-export default function App\(\)\{return <div>broken<\/div>\}/)).toBeInTheDocument();
  });

  it("renders diagnostics and unresolved risks", () => {
    render(<RepairDiagnostics repair={repairSnapshot} />);
    expect(screen.getByText(/Unexpected token/)).toBeInTheDocument();
  });
});
