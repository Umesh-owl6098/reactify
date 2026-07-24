import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import type { ExportManifest, ExportRequest, ExportSummary } from "@reactify/generation-contracts";
import { ExportSummarySchema } from "@reactify/generation-contracts";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import type { Env } from "../../env.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { getActiveVersion } from "../edit/versionStore.js";
import { evaluateExportEligibility } from "./exportEligibility.js";
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
  constructor(private readonly limits: ExportServiceLimits) {}

  static fromEnv(env: Env): ExportService {
    return new ExportService({
      maxFiles: env.MAX_EXPORT_FILES,
      maxFileBytes: env.MAX_EXPORT_FILE_BYTES,
      maxTotalBytes: env.MAX_EXPORT_TOTAL_BYTES,
      maxZipBytes: env.MAX_EXPORT_ZIP_BYTES,
    });
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

    const activeVersionRecord = getActiveVersion(record);
    const project = activeVersionRecord?.project ?? record.outputs.generatedProject!;
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

      pending.status = "ready";
      pending.fileCount = prepared.package.files.length;
      pending.totalSizeBytes = prepared.package.totalSizeBytes;
      pending.completedAt = exportedAt;
      pending.zipBuffer = zipBuffer;

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
}
