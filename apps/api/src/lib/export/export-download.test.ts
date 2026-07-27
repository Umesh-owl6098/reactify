import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { generatedProjectFixture, projectPatchFixture } from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";
import { applyProjectPatch } from "../repair/patchApplicator.js";
import { createProjectVersion, ensureInitialVersion } from "../edit/versionStore.js";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import { ExportService } from "./ExportService.js";
import { LocalStorageProvider } from "../storage/localStorageProvider.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8",
    ownerId: "owner",
    imageId: "660e8400-e29b-41d4-a716-446655440000",
    projectId: "770e8400-e29b-41d4-a716-446655440000",
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
      compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
      runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
      validatedAt: new Date().toISOString(),
    },
    projectHash,
    validationReportFingerprint: "fingerprint",
    repairRequired: false,
    repairStatus: "not_required",
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
    ...overrides,
  };
  ensureInitialVersion(record);
  return record;
}

describe("export download persistence", () => {
  let rootDir = "";
  let artifactStore: ExportArtifactStore;
  let service: ExportService;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-export-download-"));
    artifactStore = new ExportArtifactStore(new LocalStorageProvider(rootDir));
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

  it("downloads a completed export from durable storage", async () => {
    const record = createReadyRecord();
    const created = await service.createExport(record, { projectName: "Landing Page" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const exportRecord = service.getExport(record, created.summary.exportId);
    expect(exportRecord?.artifactReference).toBeTruthy();
    expect(exportRecord?.zipBuffer).toBeUndefined();

    const download = await service.resolveDownload(record, created.summary.exportId);
    expect(download.ok).toBe(true);
    if (!download.ok) {
      return;
    }

    expect(download.filename).toBe("landing-page-v1.zip");
    expect(download.buffer.byteLength).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(download.buffer);
    expect(Object.keys(zip.files).some((entry) => entry.endsWith("package.json"))).toBe(true);
  });

  it("remains downloadable after simulated API restart", async () => {
    const record = createReadyRecord();
    const created = await service.createExport(record, { projectName: "Landing Page" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const restartedStore = new ExportArtifactStore(new LocalStorageProvider(rootDir));
    const restartedService = new ExportService(
      {
        maxFiles: 200,
        maxFileBytes: 512 * 1024,
        maxTotalBytes: 5 * 1024 * 1024,
        maxZipBytes: 8 * 1024 * 1024,
      },
      restartedStore,
    );

    const download = await restartedService.resolveDownload(record, created.summary.exportId);
    expect(download.ok).toBe(true);
  });

  it("uses the same resolved storage path in API and worker stores", () => {
    const workerStore = new ExportArtifactStore(new LocalStorageProvider(rootDir));
    const apiStore = new ExportArtifactStore(new LocalStorageProvider(rootDir));
    expect(workerStore.getRootDir()).toBe(apiStore.getRootDir());
    expect(workerStore.buildStorageKey(recordId(), exportId())).toBe(
      apiStore.buildStorageKey(recordId(), exportId()),
    );
  });

  it("reconstructs a ready export when the archive file is missing", async () => {
    const record = createReadyRecord();
    const created = await service.createExport(record, { projectName: "Landing Page" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const filePath = artifactStore.resolveArchivePath(record.id, created.summary.exportId);
    await rm(filePath, { force: true });

    const download = await service.resolveDownload(record, created.summary.exportId);
    expect(download.ok).toBe(true);
    if (!download.ok) {
      return;
    }
    expect(download.reconstructed).toBe(true);
    expect(await artifactStore.archiveExists(record.id, created.summary.exportId)).toBe(true);
  });

  it("downloads the correct version for v1 and v2 exports", async () => {
    const record = createReadyRecord();
    const v1Export = await service.createExport(record, { projectName: "Landing Page" });
    expect(v1Export.ok).toBe(true);
    if (!v1Export.ok) {
      return;
    }

    const repaired = applyProjectPatch(generatedProjectFixture, projectPatchFixture);
    expect(repaired.ok).toBe(true);
    if (!repaired.ok) {
      return;
    }

    createProjectVersion({
      record,
      project: repaired.result.project,
      source: "automatic_repair",
      label: "Repair attempt 1",
      parentVersionId: record.activeVersionId,
    });
    record.projectHash = repaired.result.projectHash;
    record.outputs.generatedProject = repaired.result.project;

    const v2Export = await service.createExport(record, { projectName: "Landing Page" });
    expect(v2Export.ok).toBe(true);
    if (!v2Export.ok) {
      return;
    }

    const first = await service.resolveDownload(record, v1Export.summary.exportId);
    const second = await service.resolveDownload(record, v2Export.summary.exportId);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(first.filename).toBe("landing-page-v1.zip");
    expect(second.filename).toBe("landing-page-v2.zip");
    expect(first.buffer.equals(second.buffer)).toBe(false);
  });

  it("returns 404 for missing exports", async () => {
    const record = createReadyRecord();
    const missing = await service.resolveDownload(record, exportId());
    expect(missing.ok).toBe(false);
    if (missing.ok) {
      return;
    }
    expect(missing.statusCode).toBe(404);
    expect(missing.errorCode).toBe(ErrorCode.GENERATION_NOT_FOUND);
  });

  it("rejects path traversal when resolving storage paths", () => {
    expect(() => artifactStore.resolveArchivePath("../escape", exportId())).toThrow(/Invalid export generationId/);
  });
});

function recordId(): string {
  return "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
}

function exportId(): string {
  return "75e42c99-fef8-4f43-964c-b9918c28a0ea";
}
