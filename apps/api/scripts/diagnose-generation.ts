/** Full diagnostic snapshot for a generation (preview/export/compare eligibility). */
import { PrismaClient } from "@prisma/client";
import { buildEditSnapshotFields } from "../src/lib/edit/editEligibility.js";
import { buildExportSnapshotFields } from "../src/lib/export/exportEligibility.js";
import { buildVisualComparisonSnapshotFields } from "../src/lib/visual-comparison/visualComparisonEligibility.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { GenerationStore } from "../src/pipeline/store.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";

const generationId = process.argv[2];
if (!generationId) {
  console.error("Usage: npx tsx scripts/diagnose-generation.ts <generationId>");
  process.exit(1);
}

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true },
  });

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: row.ownerId,
  });

  if (!record) {
    throw new Error("Generation not found");
  }

  const edit = buildEditSnapshotFields(record);
  const exp = buildExportSnapshotFields(record);
  const cmp = buildVisualComparisonSnapshotFields(record);

  console.log(
    JSON.stringify(
      {
        generationId: record.id,
        status: record.status,
        currentStage: record.activeStage,
        awaitingSandboxValidation: record.awaitingSandboxValidation,
        activeVersionId: record.activeVersionId,
        projectHash: record.projectHash,
        sandboxValidation: record.sandboxValidation
          ? {
              projectHash: record.sandboxValidation.projectHash,
              compilationSuccess: record.sandboxValidation.compilation.success,
              runtimeSuccess: record.sandboxValidation.runtime.success,
              validatedAt: record.sandboxValidation.validatedAt,
            }
          : null,
        schemaValidation: record.schemaValidation,
        staticValidation: record.staticValidation,
        exportAllowed: exp.exportAllowed,
        exportBlockedReason: exp.exportBlockedReason,
        editAllowed: edit.editAllowed,
        editBlockedReason: edit.editBlockedReason,
        visualComparisonAllowed: cmp.visualComparisonAllowed,
        visualComparisonBlockedReason: cmp.visualComparisonBlockedReason,
        visualComparisonInProgress: record.visualComparisonInProgress,
        previewCaptureRequired: record.previewCaptureRequired,
        activeComparisonId: record.activeComparisonId,
        visualComparisons: record.visualComparisons.map((c) => ({
          comparisonId: c.comparisonId,
          status: c.status,
          viewport: c.viewport,
          similarityScore: c.overallSimilarityScore,
          failureReason: c.failureReason,
        })),
        exports: record.exports.map((e) => ({
          exportId: e.exportId,
          status: e.status,
          filename: e.filename,
        })),
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
