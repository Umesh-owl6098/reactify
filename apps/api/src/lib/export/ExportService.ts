import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import type { ExportManifest, ExportRequest, ExportSummary } from "@reactify/generation-contracts";
import { ExportSummarySchema } from "@reactify/generation-contracts";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import type { Env } from "../../env.js";
import { createAppStorage } from "../storage/createStorageProvider.js";
import { PermanentJobError } from "../../jobs/job-errors.js";
import type { GenerationRecord, ProjectVersionRecord } from "../../pipeline/types.js";
import { getValidActiveVersion } from "../edit/versionStore.js";
import { evaluateExportEligibility, getActiveProjectVersion } from "./exportEligibility.js";
import { ExportArtifactStore } from "./exportArtifactStore.js";
import {
  EXPORT_GITIGNORE,
  buildExportManifest,
  buildExportReadme,
  buildGenerationSummary,
  normalizeExportPackageJson,
  prepareProjectFiles,
} from "./exportPackageBuilder.js";
import {
  buildExportFilename,
  computeIdempotencyFingerprint,
  sanitizeProjectName,
} from "./exportUtils.js";
import { normalizeProjectPath } from "../validation/filePathValidator.js";

export interface InternalExportRecord extends ExportSummary {
  zipBuffer?: Buffer;
  idempotencyFingerprint?: string;
  artifactReference?: string;
  includeMetadata?: boolean;
  includeGenerationSummary?: boolean;
}

export type ExportDownloadResult =
  | { ok: true; buffer: Buffer; filename: string; reconstructed: boolean }
  | {
      ok: false;
      errorCode: ErrorCodeType;
      message: string;
      statusCode: number;
    };

interface ExportArchiveBuildInput {
  record: GenerationRecord;
  exportId: string;
  project: GeneratedProjectV1;
  versionId: string;
  versionNumber: number;
  projectHash: string;
  projectName: string;
  includeMetadata: boolean;
  includeGenerationSummary: boolean;
}

export interface ExportServiceLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxZipBytes: number;
}

export type CreateExportResult =
  | { ok: true; summary: ExportSummary; duplicate: boolean }
  | {
      ok: false;
      errorCode: ErrorCodeType;
      message: string;
      statusCode: number;
    };

function toSummary(record: InternalExportRecord): ExportSummary {
  return ExportSummarySchema.parse({
    exportId: record.exportId,
    status: record.status,
    filename: record.filename,
    projectName: record.projectName,
    generationId: record.generationId,
    versionId: record.versionId,
    versionNumber: record.versionNumber,
    projectHash: record.projectHash,
    fileCount: record.fileCount,
    totalSizeBytes: record.totalSizeBytes,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    failureReason: record.failureReason,
  });
}

export const EMPTY_EXPORT_FAILURE_REASON =
  "Export produced no project files. The archive was discarded instead of being published as downloadable.";

/**
 * An archive with no project files is never a usable export. Publishing one as
 * `ready` puts a download button in front of an empty ZIP, so a zero-file
 * package is turned into an explicit failure instead.
 */
function isEmptyExportPackage(fileCount: number, zipBuffer: Buffer): boolean {
  return fileCount <= 0 || zipBuffer.byteLength <= 0;
}

async function buildZipBuffer(entries: Array<{ path: string; content: string }>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
    archive.on("error", reject);

    archive.pipe(stream);

    for (const entry of entries) {
      archive.append(entry.content, { name: entry.path });
    }

    void archive.finalize();
  });
}

export class ExportService {
  constructor(
    private readonly limits: ExportServiceLimits,
    private readonly artifactStore: ExportArtifactStore,
  ) {}

  static fromEnv(env: Env, artifactStore?: ExportArtifactStore): ExportService {
    const store = artifactStore ?? new ExportArtifactStore(createAppStorage(env).provider);
    return new ExportService(
      {
        maxFiles: env.MAX_EXPORT_FILES,
        maxFileBytes: env.MAX_EXPORT_FILE_BYTES,
        maxTotalBytes: env.MAX_EXPORT_TOTAL_BYTES,
        maxZipBytes: env.MAX_EXPORT_ZIP_BYTES,
      },
      store,
    );
  }

  getArtifactStore(): ExportArtifactStore {
    return this.artifactStore;
  }

  getLatestSummary(record: GenerationRecord): ExportSummary | null {
    const latest = record.exports.at(-1);
    return latest ? toSummary(latest) : null;
  }

  listSummaries(record: GenerationRecord): ExportSummary[] {
    return record.exports.map((entry) => toSummary(entry));
  }

  getExport(record: GenerationRecord, exportId: string): InternalExportRecord | undefined {
    return record.exports.find((entry) => entry.exportId === exportId);
  }

  async createExport(
    record: GenerationRecord,
    request: ExportRequest,
    idempotencyKey?: string,
    logger?: { info: (message: string, fields?: Record<string, unknown>) => void; warn: (message: string, fields?: Record<string, unknown>) => void },
  ): Promise<CreateExportResult> {
    if (record.exportInProgress && !record.exports.some((entry) => entry.status === "preparing")) {
      record.exportInProgress = false;
    }

    const eligibility = evaluateExportEligibility(record);
    if (!eligibility.ok) {
      logger?.warn("export_eligibility_rejected", {
        generationId: record.id,
        activeVersionId: record.activeVersionId,
        errorCode: eligibility.errorCode,
        reason: eligibility.reason,
      });
      return {
        ok: false,
        errorCode: eligibility.errorCode,
        message: eligibility.message,
        statusCode: eligibility.errorCode === ErrorCode.GENERATION_NOT_FOUND ? 404 : 409,
      };
    }

    const project = getValidActiveVersion(record)!.project;
    const safeProjectName = sanitizeProjectName(request.projectName, project.projectName);
    const fingerprint = computeIdempotencyFingerprint({
      generationId: record.id,
      versionId: eligibility.version.versionId,
      projectName: safeProjectName,
      includeMetadata: request.includeMetadata ?? true,
      includeGenerationSummary: request.includeGenerationSummary ?? false,
      idempotencyKey,
    });

    const existing = record.exports.find(
      (entry) =>
        entry.idempotencyFingerprint === fingerprint &&
        entry.status === "ready" &&
        entry.versionId === eligibility.version.versionId,
    );
    if (existing) {
      for (const entry of record.exports) {
        if (entry.status === "preparing" && entry.exportId !== existing.exportId) {
          entry.status = "failed";
          entry.failureReason = "Superseded by a completed export.";
          entry.completedAt = new Date().toISOString();
        }
      }
      record.exportInProgress = false;
      return { ok: true, summary: toSummary(existing), duplicate: true };
    }

    if (record.exportInProgress) {
      return {
        ok: false,
        errorCode: ErrorCode.EXPORT_IN_PROGRESS,
        message: "An export is already in progress for this generation.",
        statusCode: 409,
      };
    }

    record.exportInProgress = true;
    logger?.info("export_started", {
      generationId: record.id,
      activeVersionId: record.activeVersionId,
      versionId: eligibility.version.versionId,
      projectName: safeProjectName,
      includeMetadata: request.includeMetadata ?? true,
      includeGenerationSummary: request.includeGenerationSummary ?? false,
    });
    const exportId = randomUUID();
    const createdAt = new Date().toISOString();
    const filename = buildExportFilename(safeProjectName, eligibility.version.versionNumber);
    const pending: InternalExportRecord = {
      exportId,
      status: "preparing",
      filename,
      projectName: safeProjectName,
      generationId: record.id,
      versionId: eligibility.version.versionId,
      versionNumber: eligibility.version.versionNumber,
      projectHash: eligibility.version.projectHash,
      fileCount: 0,
      totalSizeBytes: 0,
      createdAt,
      idempotencyFingerprint: fingerprint,
    };
    record.exports.push(pending);
    record.updatedAt = createdAt;

    try {
      const prepared = prepareProjectFiles(project, {
        maxFiles: this.limits.maxFiles,
        maxFileBytes: this.limits.maxFileBytes,
        maxTotalBytes: this.limits.maxTotalBytes,
      });
      if (!prepared.ok) {
        pending.status = "failed";
        pending.failureReason = prepared.message;
        pending.completedAt = new Date().toISOString();
        logger?.warn("export_prepare_failed", {
          generationId: record.id,
          stage: "prepare_project_files",
          errorCode: ErrorCode.EXPORT_TOO_LARGE,
        });
        return {
          ok: false,
          errorCode: ErrorCode.EXPORT_TOO_LARGE,
          message: prepared.message,
          statusCode: 413,
        };
      }

      const packageJson = normalizeExportPackageJson(project, safeProjectName);
      if (!packageJson.ok) {
        pending.status = "failed";
        pending.failureReason = packageJson.message;
        pending.completedAt = new Date().toISOString();
        logger?.warn("export_prepare_failed", {
          generationId: record.id,
          stage: "normalize_package_json",
          errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
        });
        return {
          ok: false,
          errorCode: ErrorCode.PROJECT_INTEGRITY_FAILED,
          message: packageJson.message,
          statusCode: 409,
        };
      }

      const exportedAt = new Date().toISOString();
      const manifest: ExportManifest = buildExportManifest({
        exportId,
        generationId: record.id,
        versionId: eligibility.version.versionId,
        versionNumber: eligibility.version.versionNumber,
        projectName: safeProjectName,
        projectHash: eligibility.version.projectHash,
        exportedAt,
        files: prepared.package.files,
        totalSizeBytes: prepared.package.totalSizeBytes,
        dependencies: project.dependencies,
        devDependencies: project.devDependencies ?? {},
      });

      const readme = buildExportReadme({
        projectName: safeProjectName,
        summary: project.summary,
        generationId: record.id,
        versionNumber: eligibility.version.versionNumber,
        projectHash: eligibility.version.projectHash,
        components: project.components.map((component) => component.name),
        dependencies: project.dependencies,
        devDependencies: project.devDependencies ?? {},
        warnings: project.warnings,
        filePaths: prepared.package.files.map((file) => file.path),
      });

      const zipEntries: Array<{ path: string; content: string }> = [];
      const rootPrefix = `${safeProjectName}/`;

      for (const file of prepared.package.files) {
        if (normalizeProjectPath(file.path) === "package.json") {
          zipEntries.push({ path: `${rootPrefix}package.json`, content: packageJson.content });
          continue;
        }
        zipEntries.push({ path: `${rootPrefix}${file.path}`, content: file.content });
      }

      zipEntries.push({ path: `${rootPrefix}README.md`, content: readme });
      zipEntries.push({ path: `${rootPrefix}.gitignore`, content: EXPORT_GITIGNORE });

      if (request.includeMetadata ?? true) {
        zipEntries.push({
          path: `${rootPrefix}reactify-manifest.json`,
          content: `${JSON.stringify(manifest, null, 2)}\n`,
        });
      }

      if (request.includeGenerationSummary) {
        zipEntries.push({
          path: `${rootPrefix}reactify-generation-summary.json`,
          content: `${JSON.stringify(
            buildGenerationSummary({
              layoutHierarchy: record.outputs.designAnalysis?.layoutHierarchy,
              planSummary: record.outputs.generationPlan?.responsiveStrategy,
              components: project.components.map((component) => component.name),
              responsiveStrategy: record.outputs.generationPlan?.responsiveStrategy,
              accessibilityStrategy: record.outputs.generationPlan?.accessibilityStrategy,
              warnings: project.warnings,
              repairCount: record.repairAttempts.length,
              versionNumber: eligibility.version.versionNumber,
              exportedAt,
            }),
            null,
            2,
          )}\n`,
        });
      }

      zipEntries.sort((left, right) => left.path.localeCompare(right.path));

      const zipBuffer = await buildZipBuffer(zipEntries);
      if (zipBuffer.byteLength > this.limits.maxZipBytes) {
        pending.status = "failed";
        pending.failureReason = "Export ZIP exceeds maximum size limit.";
        pending.completedAt = new Date().toISOString();
        return {
          ok: false,
          errorCode: ErrorCode.EXPORT_TOO_LARGE,
          message: "Export ZIP exceeds maximum size limit.",
          statusCode: 413,
        };
      }

      if (isEmptyExportPackage(prepared.package.files.length, zipBuffer)) {
        pending.status = "failed";
        pending.failureReason = EMPTY_EXPORT_FAILURE_REASON;
        pending.completedAt = new Date().toISOString();
        return {
          ok: false,
          errorCode: ErrorCode.EXPORT_FAILED,
          message: EMPTY_EXPORT_FAILURE_REASON,
          statusCode: 422,
        };
      }

      pending.status = "ready";
      pending.fileCount = prepared.package.files.length;
      pending.totalSizeBytes = prepared.package.totalSizeBytes;
      pending.completedAt = exportedAt;
      pending.includeMetadata = request.includeMetadata ?? true;
      pending.includeGenerationSummary = request.includeGenerationSummary ?? false;
      await this.finalizeReadyExport(record, pending, zipBuffer);

      logger?.info("export_completed", {
        generationId: record.id,
        exportId,
        filename,
        fileCount: pending.fileCount,
        totalSizeBytes: pending.totalSizeBytes,
        zipBytes: zipBuffer.byteLength,
      });

      return { ok: true, summary: toSummary(pending), duplicate: false };
    } catch (error) {
      pending.status = "failed";
      pending.failureReason = error instanceof Error ? error.message : "Export failed unexpectedly.";
      pending.completedAt = new Date().toISOString();
      logger?.warn("export_failed", {
        generationId: record.id,
        stage: "build_zip",
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "Export failed unexpectedly.",
      });
      return {
        ok: false,
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: "Export failed unexpectedly.",
        statusCode: 500,
      };
    } finally {
      record.exportInProgress = false;
      record.updatedAt = new Date().toISOString();
    }
  }

  initiateExport(
    record: GenerationRecord,
    request: ExportRequest,
    idempotencyKey?: string,
  ): CreateExportResult & { exportId?: string } {
    if (record.exportInProgress && !record.exports.some((entry) => entry.status === "preparing")) {
      record.exportInProgress = false;
    }

    const activeProjectVersion = getActiveProjectVersion(record);
    const project = getValidActiveVersion(record)?.project;
    const safeProjectName = project
      ? sanitizeProjectName(request.projectName, project.projectName)
      : sanitizeProjectName(request.projectName, undefined);
    const fingerprint = activeProjectVersion
      ? computeIdempotencyFingerprint({
          generationId: record.id,
          versionId: activeProjectVersion.versionId,
          projectName: safeProjectName,
          includeMetadata: request.includeMetadata ?? true,
          includeGenerationSummary: request.includeGenerationSummary ?? false,
          idempotencyKey,
        })
      : null;

    // Idempotency is checked before the active-export guard. A repeated button
    // click is the same request, not a competing export, even if the first job
    // is still preparing the archive.
    const duplicate = fingerprint
      ? record.exports.find(
          (entry) =>
            entry.idempotencyFingerprint === fingerprint &&
            (entry.status === "preparing" || entry.status === "ready") &&
            entry.versionId === activeProjectVersion?.versionId,
        )
      : undefined;
    if (duplicate) {
      if (duplicate.status === "ready") {
        for (const entry of record.exports) {
          if (entry.status === "preparing" && entry.exportId !== duplicate.exportId) {
            entry.status = "failed";
            entry.failureReason = "Superseded by a completed export.";
            entry.completedAt = new Date().toISOString();
          }
        }
        record.exportInProgress = false;
      }
      return {
        ok: true,
        summary: toSummary(duplicate),
        duplicate: true,
        exportId: duplicate.exportId,
      };
    }

    const eligibility = evaluateExportEligibility(record);
    if (!eligibility.ok) {
      return {
        ok: false,
        errorCode: eligibility.errorCode,
        message: eligibility.message,
        statusCode: eligibility.errorCode === ErrorCode.GENERATION_NOT_FOUND ? 404 : 409,
      };
    }

    const eligibleFingerprint = fingerprint!;

    const existing = record.exports.find(
      (entry) =>
        entry.idempotencyFingerprint === eligibleFingerprint &&
        entry.status === "ready" &&
        entry.versionId === eligibility.version.versionId,
    );
    if (existing) {
      for (const entry of record.exports) {
        if (entry.status === "preparing" && entry.exportId !== existing.exportId) {
          entry.status = "failed";
          entry.failureReason = "Superseded by a completed export.";
          entry.completedAt = new Date().toISOString();
        }
      }
      record.exportInProgress = false;
      return { ok: true, summary: toSummary(existing), duplicate: true, exportId: existing.exportId };
    }

    if (record.exportInProgress) {
      return {
        ok: false,
        errorCode: ErrorCode.EXPORT_IN_PROGRESS,
        message: "An export is already in progress for this generation.",
        statusCode: 409,
      };
    }

    record.exportInProgress = true;
    const exportId = randomUUID();
    const createdAt = new Date().toISOString();
    const filename = buildExportFilename(safeProjectName, eligibility.version.versionNumber);
    const pending: InternalExportRecord = {
      exportId,
      status: "preparing",
      filename,
      projectName: safeProjectName,
      generationId: record.id,
      versionId: eligibility.version.versionId,
      versionNumber: eligibility.version.versionNumber,
      projectHash: eligibility.version.projectHash,
      fileCount: 0,
      totalSizeBytes: 0,
      createdAt,
      idempotencyFingerprint: eligibleFingerprint,
      includeMetadata: request.includeMetadata ?? true,
      includeGenerationSummary: request.includeGenerationSummary ?? false,
    };
    record.exports.push(pending);
    record.updatedAt = createdAt;

    return {
      ok: true,
      summary: toSummary(pending),
      duplicate: false,
      exportId,
    };
  }

  async executeExportPreparationJob(
    record: GenerationRecord,
    exportId: string,
    hooks: {
      onProgress?: (progress: number, message: string) => Promise<void>;
      shouldCancel?: () => Promise<boolean>;
    } = {},
  ): Promise<void> {
    const pending = this.getExport(record, exportId);
    if (!pending) {
      throw new PermanentJobError(ErrorCode.GENERATION_NOT_FOUND, "Export not found.");
    }

    const request = {
      projectName: pending.projectName,
      includeMetadata: pending.includeMetadata ?? true,
      includeGenerationSummary: pending.includeGenerationSummary ?? false,
    };

    try {
      await hooks.onProgress?.(15, "Validating project");
      if (hooks.shouldCancel && (await hooks.shouldCancel())) {
        throw new Error(ErrorCode.JOB_CANCELLED);
      }

      const eligibility = evaluateExportEligibility(record, { activeExportId: exportId });
      if (!eligibility.ok) {
        pending.status = "failed";
        pending.failureReason = eligibility.message;
        pending.completedAt = new Date().toISOString();
        throw new PermanentJobError(eligibility.errorCode, eligibility.message);
      }

      const project = getValidActiveVersion(record)!.project;
      const safeProjectName = pending.projectName;

      await hooks.onProgress?.(35, "Generating README");
      const prepared = prepareProjectFiles(project, {
        maxFiles: this.limits.maxFiles,
        maxFileBytes: this.limits.maxFileBytes,
        maxTotalBytes: this.limits.maxTotalBytes,
      });
      if (!prepared.ok) {
        pending.status = "failed";
        pending.failureReason = prepared.message;
        pending.completedAt = new Date().toISOString();
        throw new Error(prepared.message);
      }

      await hooks.onProgress?.(55, "Generating manifest");
      const packageJson = normalizeExportPackageJson(project, safeProjectName);
      if (!packageJson.ok) {
        pending.status = "failed";
        pending.failureReason = packageJson.message;
        pending.completedAt = new Date().toISOString();
        throw new Error(packageJson.message);
      }

      const exportedAt = new Date().toISOString();
      const manifest = buildExportManifest({
        exportId,
        generationId: record.id,
        versionId: pending.versionId,
        versionNumber: pending.versionNumber,
        projectName: safeProjectName,
        projectHash: pending.projectHash,
        exportedAt,
        files: prepared.package.files,
        totalSizeBytes: prepared.package.totalSizeBytes,
        dependencies: project.dependencies,
        devDependencies: project.devDependencies ?? {},
      });

      const readme = buildExportReadme({
        projectName: safeProjectName,
        summary: project.summary,
        generationId: record.id,
        versionNumber: pending.versionNumber,
        projectHash: pending.projectHash,
        components: project.components.map((component) => component.name),
        dependencies: project.dependencies,
        devDependencies: project.devDependencies ?? {},
        warnings: project.warnings,
        filePaths: prepared.package.files.map((file) => file.path),
      });

      await hooks.onProgress?.(80, "Preparing ZIP export");
      const zipEntries: Array<{ path: string; content: string }> = [];
      const rootPrefix = `${safeProjectName}/`;

      for (const file of prepared.package.files) {
        if (normalizeProjectPath(file.path) === "package.json") {
          zipEntries.push({ path: `${rootPrefix}package.json`, content: packageJson.content });
          continue;
        }
        zipEntries.push({ path: `${rootPrefix}${file.path}`, content: file.content });
      }

      zipEntries.push({ path: `${rootPrefix}README.md`, content: readme });
      zipEntries.push({ path: `${rootPrefix}.gitignore`, content: EXPORT_GITIGNORE });

      if (request.includeMetadata ?? true) {
        zipEntries.push({
          path: `${rootPrefix}reactify-manifest.json`,
          content: `${JSON.stringify(manifest, null, 2)}\n`,
        });
      }

      if (request.includeGenerationSummary) {
        zipEntries.push({
          path: `${rootPrefix}reactify-generation-summary.json`,
          content: `${JSON.stringify(
            buildGenerationSummary({
              layoutHierarchy: record.outputs.designAnalysis?.layoutHierarchy,
              planSummary: record.outputs.generationPlan?.responsiveStrategy,
              components: project.components.map((component) => component.name),
              responsiveStrategy: record.outputs.generationPlan?.responsiveStrategy,
              accessibilityStrategy: record.outputs.generationPlan?.accessibilityStrategy,
              warnings: project.warnings,
              repairCount: record.repairAttempts.length,
              versionNumber: pending.versionNumber,
              exportedAt,
            }),
            null,
            2,
          )}\n`,
        });
      }

      zipEntries.sort((left, right) => left.path.localeCompare(right.path));
      const zipBuffer = await buildZipBuffer(zipEntries);
      if (zipBuffer.byteLength > this.limits.maxZipBytes) {
        pending.status = "failed";
        pending.failureReason = "Export ZIP exceeds maximum size limit.";
        pending.completedAt = new Date().toISOString();
        throw new Error("Export ZIP exceeds maximum size limit.");
      }

      if (isEmptyExportPackage(prepared.package.files.length, zipBuffer)) {
        pending.status = "failed";
        pending.failureReason = EMPTY_EXPORT_FAILURE_REASON;
        pending.completedAt = new Date().toISOString();
        throw new Error(EMPTY_EXPORT_FAILURE_REASON);
      }

      // Write the artifact BEFORE marking the export "ready". If the artifact
      // write fails, the export stays "preparing" and syncGenerationForJobFailure
      // can correctly mark it "failed".  Setting "ready" first (the old order)
      // meant that a storage failure left the export as "ready" with no artifact
      // and syncGenerationForJobFailure couldn't find a "preparing" export to fix.
      await this.finalizeReadyExport(record, pending, zipBuffer);

      pending.status = "ready";
      pending.fileCount = prepared.package.files.length;
      pending.totalSizeBytes = prepared.package.totalSizeBytes;
      pending.completedAt = exportedAt;
      await hooks.onProgress?.(100, "Ready");
    } finally {
      record.exportInProgress = false;
      record.updatedAt = new Date().toISOString();
    }
  }

  async resolveDownload(record: GenerationRecord, exportId: string): Promise<ExportDownloadResult> {
    const exportRecord = this.getExport(record, exportId);
    if (!exportRecord) {
      return {
        ok: false,
        errorCode: ErrorCode.GENERATION_NOT_FOUND,
        message: "Export not found.",
        statusCode: 404,
      };
    }

    if (exportRecord.status !== "ready") {
      return {
        ok: false,
        errorCode: ErrorCode.GENERATION_NOT_FOUND,
        message: "Export download is not available.",
        statusCode: 404,
      };
    }

    // Older records were able to reach `ready` with an empty package.
    if (exportRecord.fileCount <= 0) {
      return {
        ok: false,
        errorCode: ErrorCode.EXPORT_FAILED,
        message: EMPTY_EXPORT_FAILURE_REASON,
        statusCode: 409,
      };
    }

    const version = record.versions.find((entry) => entry.versionId === exportRecord.versionId);
    if (!version || version.projectHash !== exportRecord.projectHash) {
      return {
        ok: false,
        errorCode: ErrorCode.GENERATION_NOT_FOUND,
        message: "Export download is not available.",
        statusCode: 404,
      };
    }

    if (exportRecord.zipBuffer) {
      return {
        ok: true,
        buffer: exportRecord.zipBuffer,
        filename: exportRecord.filename,
        reconstructed: false,
      };
    }

    const fromDisk = await this.artifactStore.readArchive(record.id, exportRecord.exportId);
    if (fromDisk) {
      return {
        ok: true,
        buffer: fromDisk,
        filename: exportRecord.filename,
        reconstructed: false,
      };
    }

    const rebuilt = await this.reconstructExportArchive(record, exportRecord, version);
    if (!rebuilt.ok) {
      return rebuilt;
    }

    return {
      ok: true,
      buffer: rebuilt.buffer,
      filename: exportRecord.filename,
      reconstructed: true,
    };
  }

  private async finalizeReadyExport(
    record: GenerationRecord,
    pending: InternalExportRecord,
    zipBuffer: Buffer,
  ): Promise<void> {
    pending.artifactReference = await this.artifactStore.writeArchive(record.id, pending.exportId, zipBuffer);
    pending.zipBuffer = undefined;
  }

  private async reconstructExportArchive(
    record: GenerationRecord,
    exportRecord: InternalExportRecord,
    version: ProjectVersionRecord,
  ): Promise<{ ok: true; buffer: Buffer } | ExportDownloadResult> {
    try {
      const built = await this.buildExportArchive({
        record,
        exportId: exportRecord.exportId,
        project: version.project,
        versionId: exportRecord.versionId,
        versionNumber: exportRecord.versionNumber,
        projectHash: exportRecord.projectHash,
        projectName: exportRecord.projectName,
        includeMetadata: exportRecord.includeMetadata ?? true,
        includeGenerationSummary: exportRecord.includeGenerationSummary ?? false,
      });

      await this.finalizeReadyExport(record, exportRecord, built.zipBuffer);
      exportRecord.fileCount = built.fileCount;
      exportRecord.totalSizeBytes = built.totalSizeBytes;
      if (!exportRecord.completedAt) {
        exportRecord.completedAt = new Date().toISOString();
      }

      return { ok: true, buffer: built.zipBuffer };
    } catch (error) {
      return {
        ok: false,
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "Export download is not available.",
        statusCode: 404,
      };
    }
  }

  private async buildExportArchive(input: ExportArchiveBuildInput): Promise<{
    zipBuffer: Buffer;
    fileCount: number;
    totalSizeBytes: number;
  }> {
    const prepared = prepareProjectFiles(input.project, {
      maxFiles: this.limits.maxFiles,
      maxFileBytes: this.limits.maxFileBytes,
      maxTotalBytes: this.limits.maxTotalBytes,
    });
    if (!prepared.ok) {
      throw new Error(prepared.message);
    }

    const packageJson = normalizeExportPackageJson(input.project, input.projectName);
    if (!packageJson.ok) {
      throw new Error(packageJson.message);
    }

    const exportedAt = new Date().toISOString();
    const manifest: ExportManifest = buildExportManifest({
      exportId: input.exportId,
      generationId: input.record.id,
      versionId: input.versionId,
      versionNumber: input.versionNumber,
      projectName: input.projectName,
      projectHash: input.projectHash,
      exportedAt,
      files: prepared.package.files,
      totalSizeBytes: prepared.package.totalSizeBytes,
      dependencies: input.project.dependencies,
      devDependencies: input.project.devDependencies ?? {},
    });

    const readme = buildExportReadme({
      projectName: input.projectName,
      summary: input.project.summary,
      generationId: input.record.id,
      versionNumber: input.versionNumber,
      projectHash: input.projectHash,
      components: input.project.components.map((component) => component.name),
      dependencies: input.project.dependencies,
      devDependencies: input.project.devDependencies ?? {},
      warnings: input.project.warnings,
      filePaths: prepared.package.files.map((file) => file.path),
    });

    const zipEntries: Array<{ path: string; content: string }> = [];
    const rootPrefix = `${input.projectName}/`;

    for (const file of prepared.package.files) {
      if (normalizeProjectPath(file.path) === "package.json") {
        zipEntries.push({ path: `${rootPrefix}package.json`, content: packageJson.content });
        continue;
      }
      zipEntries.push({ path: `${rootPrefix}${file.path}`, content: file.content });
    }

    zipEntries.push({ path: `${rootPrefix}README.md`, content: readme });
    zipEntries.push({ path: `${rootPrefix}.gitignore`, content: EXPORT_GITIGNORE });

    if (input.includeMetadata) {
      zipEntries.push({
        path: `${rootPrefix}reactify-manifest.json`,
        content: `${JSON.stringify(manifest, null, 2)}\n`,
      });
    }

    if (input.includeGenerationSummary) {
      zipEntries.push({
        path: `${rootPrefix}reactify-generation-summary.json`,
        content: `${JSON.stringify(
          buildGenerationSummary({
            layoutHierarchy: input.record.outputs.designAnalysis?.layoutHierarchy,
            planSummary: input.record.outputs.generationPlan?.responsiveStrategy,
            components: input.project.components.map((component) => component.name),
            responsiveStrategy: input.record.outputs.generationPlan?.responsiveStrategy,
            accessibilityStrategy: input.record.outputs.generationPlan?.accessibilityStrategy,
            warnings: input.project.warnings,
            repairCount: input.record.repairAttempts.length,
            versionNumber: input.versionNumber,
            exportedAt,
          }),
          null,
          2,
        )}\n`,
      });
    }

    zipEntries.sort((left, right) => left.path.localeCompare(right.path));
    const zipBuffer = await buildZipBuffer(zipEntries);
    if (zipBuffer.byteLength > this.limits.maxZipBytes) {
      throw new Error("Export ZIP exceeds maximum size limit.");
    }

    return {
      zipBuffer,
      fileCount: prepared.package.files.length,
      totalSizeBytes: prepared.package.totalSizeBytes,
    };
  }
}
