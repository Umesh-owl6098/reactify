import type { Prisma, PrismaClient } from "@prisma/client";
import type { GenerationRecord } from "../../pipeline/types.js";
import { mapLoadedGenerationToRecord, mapRecordToGenerationData } from "../mappers/generationMapper.js";
import { mapPrismaError, PersistenceError } from "../errors.js";
import { ErrorCode } from "@reactify/shared";

const generationInclude = {
  stages: { orderBy: { startedAt: "asc" as const } },
  versions: { orderBy: { versionNumber: "asc" as const } },
  repairAttempts: { orderBy: { attemptNumber: "asc" as const } },
  edits: { include: { clarifications: { orderBy: { roundNumber: "asc" as const } } }, orderBy: { createdAt: "asc" as const } },
  visualComparisons: { include: { correctionAttempts: { orderBy: { attemptNumber: "asc" as const } } }, orderBy: { createdAt: "asc" as const } },
  exports: { orderBy: { createdAt: "asc" as const } },
};

export class GenerationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string, ownerId?: string, includeDeleted = false): Promise<GenerationRecord | null> {
    try {
      const row = await this.prisma.generation.findFirst({
        where: {
          id,
          ...(ownerId ? { ownerId } : {}),
          ...(includeDeleted ? {} : { deletedAt: null }),
        },
        include: generationInclude,
      });
      return row ? mapLoadedGenerationToRecord(row) : null;
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async findAllActive(): Promise<GenerationRecord[]> {
    try {
      const rows = await this.prisma.generation.findMany({
        where: { deletedAt: null },
        include: generationInclude,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(mapLoadedGenerationToRecord);
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async list(input: {
    ownerId: string;
    status?: string;
    limit: number;
    offset: number;
    order?: "asc" | "desc";
  }): Promise<{ total: number; items: GenerationRecord[] }> {
    try {
      const where: Prisma.GenerationWhereInput = {
        ownerId: input.ownerId,
        deletedAt: null,
        ...(input.status ? { status: input.status } : {}),
      };
      const [total, rows] = await this.prisma.$transaction([
        this.prisma.generation.count({ where }),
        this.prisma.generation.findMany({
          where,
          include: generationInclude,
          orderBy: { createdAt: input.order ?? "desc" },
          take: input.limit,
          skip: input.offset,
        }),
      ]);
      return { total, items: rows.map(mapLoadedGenerationToRecord) };
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async save(record: GenerationRecord, expectedStateVersion?: number): Promise<GenerationRecord> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
        const existing = await tx.generation.findUnique({ where: { id: record.id } });
        if (existing && expectedStateVersion !== undefined && existing.stateVersion !== expectedStateVersion) {
          throw new PersistenceError("Generation was modified concurrently.", ErrorCode.CONCURRENT_MODIFICATION);
        }

        const nextStateVersion = (existing?.stateVersion ?? record.stateVersion ?? 0) + 1;
        const data = mapRecordToGenerationData({ ...record, stateVersion: nextStateVersion });

        await tx.generation.upsert({
          where: { id: record.id },
          create: {
            ...(data as Prisma.GenerationUncheckedCreateInput),
            id: record.id,
            createdAt: new Date(record.createdAt),
          },
          update: data,
        });

        await tx.pipelineStageRecord.deleteMany({ where: { generationId: record.id } });
        if (record.stages.length > 0) {
          await tx.pipelineStageRecord.createMany({
            data: record.stages.map((stage) => ({
              generationId: record.id,
              stageName: stage.stage,
              status: stage.status,
              startedAt: stage.startedAt ? new Date(stage.startedAt) : null,
              completedAt: stage.completedAt ? new Date(stage.completedAt) : null,
              durationMs: stage.durationMs ?? null,
              errorCode: stage.errorCode ?? null,
              errorMessage: stage.errorMessage ?? null,
            })),
          });
        }

        for (const version of record.versions) {
          const isActiveVersion = version.versionId === record.activeVersionId;
          const validationStatus = isActiveVersion
            ? {
                schemaValidationStatus:
                  record.schemaValidation?.valid === true
                    ? "valid"
                    : record.schemaValidation
                      ? "invalid"
                      : null,
                staticValidationStatus:
                  record.staticValidation?.valid === true
                    ? "valid"
                    : record.staticValidation
                      ? "invalid"
                      : null,
                compilationStatus:
                  record.sandboxValidation?.compilation.success === true
                    ? "passed"
                    : record.sandboxValidation
                      ? "failed"
                      : null,
                runtimeValidationStatus:
                  record.sandboxValidation?.runtime.success === true
                    ? "passed"
                    : record.sandboxValidation
                      ? "failed"
                      : null,
              }
            : {};
          const data = {
            generationId: record.id,
            versionId: version.versionId,
            versionNumber: version.versionNumber,
            source: version.source,
            label: version.label,
            projectHash: version.projectHash,
            parentVersionId: version.parentVersionId,
            projectSnapshot: version.project,
            changedFiles: version.changedFiles,
            editId: version.editId ?? null,
            instruction: version.instruction ?? null,
            createdAt: new Date(version.createdAt),
            ...validationStatus,
          };
          await tx.projectVersion.upsert({
            where: {
              generationId_versionId: {
                generationId: record.id,
                versionId: version.versionId,
              },
            },
            create: data,
            // Project versions are immutable snapshots. Generation saves may
            // update validation metadata, but must never rewrite an existing
            // snapshot that exports, edits, or comparisons already reference.
            update: validationStatus,
          });
        }

        for (const attempt of record.repairAttempts) {
          const data = {
              generationId: record.id,
              attemptNumber: attempt.attemptNumber,
              status: attempt.status,
              provider: attempt.provider,
              model: attempt.model,
              promptVersion: attempt.promptVersion,
              inputTokens: attempt.inputTokens,
              outputTokens: attempt.outputTokens,
              latencyMs: attempt.latencyMs,
              diagnosticsBefore: attempt.diagnosticsBefore,
              repairabilityClassification: attempt.repairabilityClassification,
              patchSummary: attempt.patchSummary ?? null,
              changedFiles: attempt.changedFiles,
              deletedFiles: attempt.deletedFiles,
              dependencyChanges: attempt.dependencyChanges,
              projectHashBefore: attempt.projectHashBefore,
              projectHashAfter: attempt.projectHashAfter ?? null,
              staticValidationAfter: attempt.staticValidationAfter ?? undefined,
              sandboxValidationAfter: attempt.sandboxValidationAfter ?? undefined,
              patchFingerprint: attempt.patchFingerprint ?? null,
              diagnosticsFingerprint: attempt.diagnosticsFingerprint ?? null,
              failureReason: attempt.failureReason ?? null,
              repeatedPatchDetected: attempt.repeatedPatchDetected,
              repeatedDiagnosticsDetected: attempt.repeatedDiagnosticsDetected,
              unresolvedRisks: attempt.unresolvedRisks,
              startedAt: new Date(attempt.startedAt),
              completedAt: attempt.completedAt ? new Date(attempt.completedAt) : null,
          };
          await tx.repairAttempt.upsert({
            where: {
              generationId_attemptNumber: {
                generationId: record.id,
                attemptNumber: attempt.attemptNumber,
              },
            },
            create: data,
            update: data,
          });
        }

        for (const edit of record.edits) {
          const data = {
              editId: edit.editId,
              generationId: record.id,
              sourceVersionId: edit.sourceVersionId,
              createdVersionId: edit.createdVersionId ?? null,
              instruction: edit.instruction,
              resolvedInstruction: edit.resolvedInstruction,
              intent: edit.intent ?? undefined,
              status: edit.status,
              projectHashBefore: edit.projectHashBefore ?? null,
              projectHashAfter: edit.projectHashAfter ?? null,
              changedFiles: edit.changedFiles,
              selectedFiles: edit.selectedFiles ?? [],
              selectedComponentIds: edit.selectedComponentIds ?? [],
              pendingEdit: edit.pendingEdit ?? undefined,
              pendingIntent: edit.pendingIntent ?? undefined,
              clarificationAnswers: edit.clarificationAnswers,
              clarificationRound: edit.clarificationRound,
              clarificationQuestion: edit.clarificationQuestion ?? null,
              confirmationRequired: edit.confirmationRequired ?? false,
              versionNumber: edit.versionNumber ?? null,
              idempotencyFingerprint: edit.idempotencyFingerprint ?? null,
              failureReason: edit.failureReason ?? null,
              createdAt: new Date(edit.createdAt),
              completedAt: edit.completedAt ? new Date(edit.completedAt) : null,
          };
          await tx.projectEdit.upsert({
            where: { editId: edit.editId },
            create: data,
            update: data,
          });
        }

        for (const comparison of record.visualComparisons) {
          const data = {
              comparisonId: comparison.comparisonId,
              generationId: record.id,
              versionId: comparison.versionId,
              projectHash: comparison.projectHash,
              viewport: comparison.viewport,
              status: comparison.status,
              similarityScore: comparison.overallSimilarityScore,
              pixelDifferencePercentage: comparison.pixelDifferencePercentage,
              structuralDifferenceScore: comparison.structuralDifferenceScore,
              regions: comparison.regions,
              summary: comparison.summary,
              correctionRecommended: comparison.correctionRecommended,
              artifactReferences: {
                sourceImage: comparison.sourceImage,
                previewImage: comparison.previewImage,
              },
              screenshotSubmitted: comparison.screenshotSubmitted ?? false,
              idempotencyFingerprint: comparison.idempotencyFingerprint ?? null,
              createdAt: new Date(comparison.createdAt),
              completedAt: comparison.completedAt ? new Date(comparison.completedAt) : null,
          };
          await tx.visualComparison.upsert({
            where: { comparisonId: comparison.comparisonId },
            create: data,
            update: data,
          });
        }

        for (const entry of record.exports) {
          const data = {
              exportId: entry.exportId,
              generationId: record.id,
              versionId: entry.versionId,
              status: entry.status,
              filename: entry.filename,
              projectName: entry.projectName,
              projectHash: entry.projectHash,
              fileCount: entry.fileCount,
              totalSizeBytes: entry.totalSizeBytes,
              versionNumber: entry.versionNumber,
              idempotencyFingerprint: entry.idempotencyFingerprint ?? null,
              failureReason: entry.failureReason ?? null,
              artifactReference: entry.artifactReference ?? null,
              options: {
                includeMetadata: entry.includeMetadata ?? true,
                includeGenerationSummary: entry.includeGenerationSummary ?? false,
              },
              createdAt: new Date(entry.createdAt),
              completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
          };
          await tx.projectExport.upsert({
            where: { exportId: entry.exportId },
            create: data,
            update: data,
          });
        }

        const saved = await tx.generation.findUniqueOrThrow({
          where: { id: record.id },
          include: generationInclude,
        });
        return mapLoadedGenerationToRecord(saved);
        },
        // Saves upsert every immutable version snapshot (large JSON payloads);
        // the Prisma default 5s interactive-transaction timeout aborts mid-save
        // with P2028 once a generation accumulates versions and comparisons.
        { maxWait: 10_000, timeout: 60_000 },
      );
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async softDelete(id: string, ownerId: string): Promise<boolean> {
    try {
      const result = await this.prisma.generation.updateMany({
        where: { id, ownerId, deletedAt: null },
        data: { deletedAt: new Date(), updatedAt: new Date() },
      });
      return result.count > 0;
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async listSummaries(input: {
    ownerId: string;
    status?: string;
    limit: number;
    offset: number;
    order?: "asc" | "desc";
  }): Promise<{
    total: number;
    items: Array<{
      generationId: string;
      status: string;
      sourceImageFilename: string | null;
      currentStage: string | null;
      activeVersionNumber: number | null;
      latestProjectHash: string | null;
      latestSimilarityScore: number | null;
      repairCount: number;
      editCount: number;
      versionCount: number;
      exportCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    try {
      const where: Prisma.GenerationWhereInput = {
        ownerId: input.ownerId,
        deletedAt: null,
        ...(input.status ? { status: input.status } : {}),
      };

      const [total, rows] = await this.prisma.$transaction([
        this.prisma.generation.count({ where }),
        this.prisma.generation.findMany({
          where,
          include: {
            sourceImage: true,
            versions: { select: { versionId: true, versionNumber: true } },
            visualComparisons: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { similarityScore: true },
            },
            _count: {
              select: {
                repairAttempts: true,
                edits: true,
                versions: true,
                exports: true,
              },
            },
          },
          orderBy: { createdAt: input.order ?? "desc" },
          take: input.limit,
          skip: input.offset,
        }),
      ]);

      return {
        total,
        items: rows.map((row) => {
          const activeVersion = row.versions.find((version) => version.versionId === row.activeVersionId);
          return {
            generationId: row.id,
            status: row.status,
            sourceImageFilename: row.sourceImage.originalFilename,
            currentStage: row.currentStage,
            activeVersionNumber: activeVersion?.versionNumber ?? null,
            latestProjectHash: row.latestProjectHash,
            latestSimilarityScore: row.visualComparisons[0]?.similarityScore ?? null,
            repairCount: row._count.repairAttempts,
            editCount: row._count.edits,
            versionCount: row._count.versions,
            exportCount: row._count.exports,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          };
        }),
      };
    } catch (error) {
      throw mapPrismaError(error);
    }
  }
}
