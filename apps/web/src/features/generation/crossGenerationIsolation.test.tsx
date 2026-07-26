import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EditOperationSummary,
  ExportSummary,
  GenerationStatusResponse,
  VisualComparisonResult,
} from "@reactify/generation-contracts";
import { fetchEditHistory, fetchExportHistory, fetchVisualComparisonHistory } from "../../lib/generation-api";
import { visualComparisonPollingDefaults } from "../../test/visualComparisonPollingDefaults";
import { useProjectEdit } from "../project-edit/useProjectEdit";
import { useProjectEditStore } from "../project-edit/projectEditStore";
import { useProjectExport } from "../export/useProjectExport";
import { useExportStore } from "../export/exportStore";
import { useVisualComparison } from "../visual-comparison/useVisualComparison";
import { useVisualComparisonStore } from "../visual-comparison/visualComparisonStore";
import { keepGenerationRecord, keepGenerationRecords } from "./generationScopedRecords";

vi.mock("../../lib/generation-api", async () => {
  const actual = await vi.importActual<typeof import("../../lib/generation-api")>("../../lib/generation-api");
  return {
    ...actual,
    fetchEditHistory: vi.fn(),
    fetchExportHistory: vi.fn(),
    fetchVisualComparisonHistory: vi.fn(),
  };
});

const GENERATION_A = "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const GENERATION_B = "a1178bcb-8c58-4f0a-8884-d50082445368";

function buildEdit(generationId: string, instruction: string): EditOperationSummary {
  return {
    editId: `${generationId.slice(0, 8)}-0000-4000-8000-000000000001`,
    generationId,
    status: "completed",
    instruction,
    sourceVersionId: "v1",
    projectHashBefore: "hash-before",
    changedFiles: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildExport(generationId: string, filename: string): ExportSummary {
  return {
    exportId: `${generationId.slice(0, 8)}-0000-4000-8000-000000000002`,
    status: "ready",
    filename,
    projectName: filename.replace(/-v\d+\.zip$/, ""),
    generationId,
    versionId: "v1",
    versionNumber: 1,
    projectHash: "hash",
    fileCount: 12,
    totalSizeBytes: 11057,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildComparison(generationId: string): VisualComparisonResult {
  return {
    comparisonId: `${generationId.slice(0, 8)}-0000-4000-8000-000000000003`,
    generationId,
    versionId: "v1",
    projectHash: "hash",
    status: "completed",
    viewport: { width: 1440, height: 800, deviceScaleFactor: 1 },
    sourceImage: { width: 1440, height: 800 },
    previewImage: { width: 1440, height: 800 },
    overallSimilarityScore: 88,
    pixelDifferencePercentage: 12,
    structuralDifferenceScore: 0.1,
    regions: [],
    summary: "",
    correctionRecommended: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function buildStatus(generationId: string, overrides: Partial<GenerationStatusResponse> = {}): GenerationStatusResponse {
  return {
    id: generationId,
    imageId: "660e8400-e29b-41d4-a716-446655440000",
    projectId: "770e8400-e29b-41d4-a716-446655440000",
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: { designAnalysis: null, generationPlan: null, generatedProject: null },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: null,
    projectHash: `hash-${generationId.slice(0, 8)}`,
    editedByUser: false,
    confirmedAt: "2026-01-01T00:00:00.000Z",
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
    activeVersionId: null,
    activeVersionNumber: null,
    sandboxRevalidationRequired: false,
    ...visualComparisonPollingDefaults,
    featureFlags: { enableGenerationPlanEditing: true },
    manualRetryAllowed: false,
    retryAllowed: false,
    errors: [],
    durations: { totalMs: 0, stages: {} },
    ...overrides,
  } as GenerationStatusResponse;
}

describe("cross-generation isolation", () => {
  beforeEach(() => {
    useProjectEditStore.getState().reset();
    useExportStore.getState().reset();
    useVisualComparisonStore.getState().reset();
    vi.clearAllMocks();
  });

  describe("keepGenerationRecords", () => {
    it("drops records that belong to another generation", () => {
      const records = [buildEdit(GENERATION_A, "Change the dashboard title text color to blue."), buildEdit(GENERATION_B, "Widen the hero.")];
      expect(keepGenerationRecords(records, GENERATION_B)).toEqual([records[1]]);
    });

    it("returns nothing when no generation is in scope", () => {
      expect(keepGenerationRecords([buildEdit(GENERATION_A, "x")], null)).toEqual([]);
    });

    it("drops a single record from another generation", () => {
      expect(keepGenerationRecord(buildExport(GENERATION_A, "sales-v1.zip"), GENERATION_B)).toBeNull();
    });
  });

  it("does not leak edit history when navigating from one generation to another", async () => {
    vi.mocked(fetchEditHistory).mockImplementation(async (generationId: string) => ({
      generationId,
      edits:
        generationId === GENERATION_A
          ? [buildEdit(GENERATION_A, "Change the dashboard title text color to blue.")]
          : [],
    }));

    const { result, rerender } = renderHook(
      ({ status }) => useProjectEdit(status, () => undefined),
      { initialProps: { status: buildStatus(GENERATION_A) } },
    );

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1);
    });
    expect(result.current.history[0]?.instruction).toContain("dashboard title");

    rerender({ status: buildStatus(GENERATION_B) });

    await waitFor(() => {
      expect(result.current.history).toEqual([]);
    });
    expect(
      result.current.history.some((edit) => edit.generationId === GENERATION_A),
    ).toBe(false);
  });

  it("filters out edits the server attributes to a different generation", async () => {
    // Even if the API misbehaves, another generation's edit must not render.
    vi.mocked(fetchEditHistory).mockResolvedValue({
      generationId: GENERATION_B,
      edits: [
        buildEdit(GENERATION_A, "Change the dashboard title text color to blue."),
        buildEdit(GENERATION_B, "Widen the hero."),
      ],
    });

    const { result } = renderHook(() => useProjectEdit(buildStatus(GENERATION_B), () => undefined));

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1);
    });
    expect(result.current.history[0]?.generationId).toBe(GENERATION_B);
  });

  it("clears an active edit that belongs to the previous generation", async () => {
    vi.mocked(fetchEditHistory).mockResolvedValue({ generationId: GENERATION_A, edits: [] });

    const editA = buildEdit(GENERATION_A, "Change the dashboard title text color to blue.");
    const { result, rerender } = renderHook(
      ({ status }) => useProjectEdit(status, () => undefined),
      { initialProps: { status: buildStatus(GENERATION_A, { latestEditSummary: editA }) } },
    );

    await waitFor(() => {
      expect(result.current.activeEdit?.editId).toBe(editA.editId);
    });

    rerender({ status: buildStatus(GENERATION_B, { latestEditSummary: null }) });

    await waitFor(() => {
      expect(result.current.activeEdit).toBeNull();
    });
  });

  it("does not leak export history across generations", async () => {
    vi.mocked(fetchExportHistory).mockImplementation(async (generationId: string) => ({
      generationId,
      exports: generationId === GENERATION_A ? [buildExport(GENERATION_A, "salesdashboard-v1.zip")] : [],
    }));

    const { result, rerender } = renderHook(
      ({ status }) => useProjectExport(status, () => undefined),
      { initialProps: { status: buildStatus(GENERATION_A) } },
    );

    await waitFor(() => {
      expect(result.current.history).toHaveLength(1);
    });

    rerender({ status: buildStatus(GENERATION_B) });

    await waitFor(() => {
      expect(result.current.history).toEqual([]);
    });
  });

  it("does not leak the latest export summary across generations", async () => {
    vi.mocked(fetchExportHistory).mockResolvedValue({ generationId: GENERATION_B, exports: [] });

    const { result } = renderHook(() =>
      useProjectExport(
        buildStatus(GENERATION_B, { latestExportSummary: buildExport(GENERATION_A, "salesdashboard-v1.zip") }),
        () => undefined,
      ),
    );

    await waitFor(() => {
      expect(result.current.latestSummary).toBeNull();
    });
  });

  it("does not leak visual comparison history across generations", async () => {
    vi.mocked(fetchVisualComparisonHistory).mockImplementation(async (generationId: string) => ({
      generationId,
      comparisons: generationId === GENERATION_A ? [buildComparison(GENERATION_A)] : [],
    }));

    const { result, rerender } = renderHook(
      ({ status }) => useVisualComparison(status, () => undefined),
      { initialProps: { status: buildStatus(GENERATION_A) } },
    );

    await waitFor(() => {
      expect(result.current.store.history).toHaveLength(1);
    });

    rerender({ status: buildStatus(GENERATION_B) });

    await waitFor(() => {
      expect(result.current.store.history).toEqual([]);
    });
  });

  it("does not leak the project hash across generations", async () => {
    vi.mocked(fetchEditHistory).mockResolvedValue({ generationId: GENERATION_A, edits: [] });

    const { result, rerender } = renderHook(
      ({ status }) => useProjectEdit(status, () => undefined),
      { initialProps: { status: buildStatus(GENERATION_A) } },
    );

    expect(result.current.projectHash).toBe(`hash-${GENERATION_A.slice(0, 8)}`);

    rerender({ status: buildStatus(GENERATION_B) });

    expect(result.current.projectHash).toBe(`hash-${GENERATION_B.slice(0, 8)}`);
  });
});
