/** Reconcile locks for a generation and persist (no GitHub push). */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { buildEditSnapshotFields } from "../src/lib/edit/editEligibility.js";
import { buildExportSnapshotFields } from "../src/lib/export/exportEligibility.js";
import { buildVisualComparisonSnapshotFields } from "../src/lib/visual-comparison/visualComparisonEligibility.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const ownerId = (await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { ownerId: true } }))
    .ownerId;

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record) {
    throw new Error("Generation not found");
  }

  reconcileGenerationLocksSync(record, { editLockTimeoutMs: 0, visualCaptureTimeoutMs: 0, exportLockTimeoutMs: 0 });
  await store.persist(record);

  const edit = buildEditSnapshotFields(record);
  const exp = buildExportSnapshotFields(record);
  const cmp = buildVisualComparisonSnapshotFields(record);

  console.log(
    JSON.stringify(
      {
        generationId,
        status: record.status,
        exportInProgress: record.exportInProgress,
        exports: record.exports.map((entry) => ({ exportId: entry.exportId, status: entry.status })),
        exportAllowed: exp.exportAllowed,
        editAllowed: edit.editAllowed,
        visualComparisonAllowed: cmp.visualComparisonAllowed,
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
