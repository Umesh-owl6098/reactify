import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ExportManifestSchema } from "@reactify/generation-contracts";
import { generatedProjectFixture } from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import type { GenerationRecord } from "../../pipeline/types.js";
import { computeProjectHash } from "../projectHash.js";
import { ensureInitialVersion } from "../edit/versionStore.js";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import { ExportService, type InternalExportRecord } from "./ExportService.js";

function createReadyRecord(overrides: Partial<GenerationRecord> = {}): GenerationRecord {
  const projectHash = computeProjectHash(generatedProjectFixture);
  const record: GenerationRecord = {
    id: "550e8400-e29b-41d4-a716-446655440000",
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

describe("ExportService", () => {
  let rootDir = "";
  let service: ExportService;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "reactify-export-service-"));
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

  it("creates a ZIP with required project files and metadata", async () => {
    const record = createReadyRecord();
    const result = await service.createExport(record, {
      projectName: "Landing Page",
      includeMetadata: true,
      includeGenerationSummary: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.summary.filename).toBe("landing-page-v1.zip");
    expect(result.summary.status).toBe("ready");

    const exportRecord = service.getExport(record, result.summary.exportId);
    expect(exportRecord?.artifactReference).toBeTruthy();

    const download = await service.resolveDownload(record, result.summary.exportId);
    expect(download.ok).toBe(true);
    if (!download.ok) {
      return;
    }

    const zip = await JSZip.loadAsync(download.buffer);
    const entries = Object.keys(zip.files);
    expect(entries.some((entry) => entry.startsWith("landing-page/"))).toBe(true);
    expect(entries).toContain("landing-page/README.md");
    expect(entries).toContain("landing-page/reactify-manifest.json");
    expect(entries).toContain("landing-page/reactify-generation-summary.json");
    expect(entries).toContain("landing-page/package.json");
    expect(entries).toContain("landing-page/vite.config.ts");
    expect(entries.some((entry) => entry.includes("node_modules"))).toBe(false);
    expect(entries.some((entry) => entry.includes(".env"))).toBe(false);

    const manifestRaw = await zip.file("landing-page/reactify-manifest.json")?.async("string");
    expect(manifestRaw).toBeTruthy();
    const manifest = ExportManifestSchema.parse(JSON.parse(manifestRaw!));
    expect(manifest.generationId).toBe(record.id);
    expect(manifest.versionId).toBe(record.projectHash);
    expect(manifest.projectHash).toBe(record.projectHash);
    expect(manifest.files.map((file) => file.path)).toEqual(
      [...manifest.files.map((file) => file.path)].sort(),
    );

    const packageJson = JSON.parse((await zip.file("landing-page/package.json")?.async("string"))!);
    expect(packageJson.private).toBe(true);
    expect(packageJson.scripts.dev).toBeTruthy();
    expect(packageJson.scripts.build).toBeTruthy();
    expect(packageJson.scripts.preview).toBeTruthy();
  });

  it("creates MockLandingPage export with metadata and without generation summary", async () => {
    const record = createReadyRecord();
    const result = await service.createExport(record, {
      projectName: "MockLandingPage",
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.summary.status).toBe("ready");
    expect(result.summary.filename).toBe("mocklandingpage-v1.zip");
    expect(result.summary.projectName).toBe("mocklandingpage");

    const download = await service.resolveDownload(record, result.summary.exportId);
    expect(download.ok).toBe(true);
    if (!download.ok) {
      return;
    }

    const zip = await JSZip.loadAsync(download.buffer);
    const entries = Object.keys(zip.files);
    expect(entries).toContain("mocklandingpage/package.json");
    expect(entries).toContain("mocklandingpage/index.html");
    expect(entries).toContain("mocklandingpage/README.md");
    expect(entries).toContain("mocklandingpage/reactify-manifest.json");
    expect(entries.some((entry) => entry.endsWith("reactify-generation-summary.json"))).toBe(false);
  });

  it("excludes optional generation summary when disabled", async () => {
    const record = createReadyRecord();
    const result = await service.createExport(record, {
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const download = await service.resolveDownload(record, result.summary.exportId);
    expect(download.ok).toBe(true);
    if (!download.ok) {
      return;
    }

    const zip = await JSZip.loadAsync(download.buffer);
    const entries = Object.keys(zip.files);
    expect(entries.some((entry) => entry.endsWith("reactify-generation-summary.json"))).toBe(false);
  });

  it("returns duplicate export for matching idempotency key", async () => {
    const record = createReadyRecord();
    const request = { includeMetadata: true, includeGenerationSummary: false };

    const first = await service.createExport(record, request, "same-key");
    const second = await service.createExport(record, request, "same-key");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }

    expect(second.duplicate).toBe(true);
    expect(second.summary.exportId).toBe(first.summary.exportId);
  });

  it("rejects export while another export is in progress", async () => {
    const record = createReadyRecord({
      exportInProgress: true,
      exports: [
        {
          exportId: "880e8400-e29b-41d4-a716-446655440000",
          status: "preparing",
          filename: "mocklandingpage-v1.zip",
          projectName: "mocklandingpage",
          generationId: "550e8400-e29b-41d4-a716-446655440000",
          versionId: computeProjectHash(generatedProjectFixture),
          versionNumber: 1,
          projectHash: computeProjectHash(generatedProjectFixture),
          fileCount: 0,
          totalSizeBytes: 0,
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const result = await service.createExport(record, {});
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe(ErrorCode.EXPORT_IN_PROGRESS);
  });

  it("clears stale exportInProgress flag when no preparing export exists", async () => {
    const record = createReadyRecord({ exportInProgress: true });
    const result = await service.createExport(record, {
      projectName: "MockLandingPage",
      includeMetadata: true,
      includeGenerationSummary: false,
    });

    expect(result.ok).toBe(true);
    expect(record.exportInProgress).toBe(false);
  });

  it("rejects oversized exports", async () => {
    const artifactStore = new ExportArtifactStore(rootDir);
    const tinyService = new ExportService(
      {
        maxFiles: 200,
        maxFileBytes: 512 * 1024,
        maxTotalBytes: 50,
        maxZipBytes: 8 * 1024 * 1024,
      },
      artifactStore,
    );
    const record = createReadyRecord();
    const result = await tinyService.createExport(record, {});
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.errorCode).toBe(ErrorCode.EXPORT_TOO_LARGE);
  });

  it("completes export preparation for the active in-progress export job", async () => {
    const record = createReadyRecord();
    ensureInitialVersion(record);
    const exportId = "880e8400-e29b-41d4-a716-446655440000";
    record.exportInProgress = true;
    record.exports.push({
      exportId,
      status: "preparing",
      filename: "mock-landing-page-v1.zip",
      projectName: "mock-landing-page",
      generationId: record.id,
      versionId: record.activeVersionId!,
      versionNumber: 1,
      projectHash: record.projectHash!,
      fileCount: 0,
      totalSizeBytes: 0,
      createdAt: new Date().toISOString(),
      includeMetadata: true,
      includeGenerationSummary: false,
    } as InternalExportRecord & { includeMetadata?: boolean; includeGenerationSummary?: boolean });

    await service.executeExportPreparationJob(record, exportId);

    const exportRecord = service.getExport(record, exportId);
    expect(exportRecord?.status).toBe("ready");
    expect(record.status).toBe("Ready");
    expect(record.exportInProgress).toBe(false);
  });
});
