import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import { evaluateExportEligibility } from "./exportEligibility.js";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import { ExportService } from "./ExportService.js";
import { ensureInitialVersion } from "../edit/versionStore.js";
import { syncGenerationForJobFailure } from "../../jobs/generation-sync.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";

function create924ae008ReadyRecord(): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: "924ae008-db1d-44ed-97b7-2019de8b6bf4",
    ownerId: "owner",
    imageId: "image",
    projectId: "project",
    status: "Ready",
    activeStage: null,
    stages: [],
    outputs: {
      designAnalysis: null,
      generationPlan: null,
      generatedProject: generatedProjectFixture,
    },
    analysis: null,
    plan: null,
    project: null,
    schemaValidation: { valid: true, errors: [] },
    staticValidation: { valid: true, errors: [], warnings: [] },
    sandboxValidation: {
      projectHash,
      compilation: { success: true, durationMs: 120, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 120, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    projectHash,
    validationReportFingerprint: "fingerprint",
    repairRequired: false,
    repairStatus: "succeeded",
    currentRepairAttempt: 0,
    maxRepairAttempts: 3,
    repairAttempts: [],
    repairInProgress: false,
    manualRetryAllowed: false,
    editedByUser: false,
    confirmedAt: new Date().toISOString(),
    awaitingPlanConfirmation: false,
    awaitingSandboxValidation: false,
    pipelineState: null,
    resumeInProgress: false,
    sandboxResumeInProgress: false,
    errors: [],
    cancelled: false,
    exports: [],
    exportInProgress: false,
    versions: [],
    activeVersionId: null,
    edits: [],
    editInProgress: false,
    activeEditId: null,
    rollbackInProgress: false,
    visualComparisons: [],
    visualComparisonInProgress: false,
    activeComparisonId: null,
    visualCorrectionInProgress: false,
    visualCorrectionAttempt: 0,
    visualCorrectionMaxAttempts: 3,
    previewCaptureRequired: false,
    pendingVisualRecomparison: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureInitialVersion(record);
  return record;
}

describe("924ae008 export failure regression", () => {
  let rootDir = "";
  let service: ExportService;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-export-regression-"));
    const artifactStore = new ExportArtifactStore(rootDir);
    await artifactStore.ensureReady();
    service = new ExportService(
      {
        maxFiles: 200,
        maxFileBytes: 512 * 1024,
        maxTotalBytes: 5 * 1024 * 1024,
        maxZipBytes: 8 * 1024 * 1024,
      },
      artifactStore,
    );
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("does not self-block export preparation at Validating project", async () => {
    const record = create924ae008ReadyRecord();
    const initiated = service.initiateExport(record, {
      projectName: "MountainSunsetBackground",
      includeMetadata: true,
      includeGenerationSummary: true,
    });
    expect(initiated.ok).toBe(true);
    if (!initiated.ok) {
      return;
    }

    const blockedWithoutActiveExport = evaluateExportEligibility(record);
    expect(blockedWithoutActiveExport.ok).toBe(false);

    const allowedForActiveJob = evaluateExportEligibility(record, {
      activeExportId: initiated.exportId!,
    });
    expect(allowedForActiveJob.ok).toBe(true);

    await service.executeExportPreparationJob(record, initiated.exportId!);
    expect(service.getExport(record, initiated.exportId!)?.status).toBe("ready");
  });

  it("returns the preparing export when the same request is repeated", () => {
    const record = create924ae008ReadyRecord();
    const request = {
      projectName: "MountainSunsetBackground",
      includeMetadata: true,
      includeGenerationSummary: true,
    };

    const first = service.initiateExport(record, request, "repeat-click");
    const second = service.initiateExport(record, request, "repeat-click");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(second.duplicate).toBe(true);
    expect(second.summary.exportId).toBe(first.summary.exportId);
    expect(record.exports).toHaveLength(1);
  });

  it("keeps the generation Ready when export preparation fails terminally", () => {
    const record = create924ae008ReadyRecord();
    syncGenerationForJobFailure(record, ErrorCode.EXPORT_IN_PROGRESS, "export_preparation");
    expect(record.status).toBe("Ready");
  });
});
