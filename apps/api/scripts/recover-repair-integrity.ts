/**
 * Recover project integrity for a repaired generation via the normal hydrate path.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { evaluateEditEligibility } from "../src/lib/edit/editEligibility.js";
import { evaluateExportEligibility } from "../src/lib/export/exportEligibility.js";
import { computeProjectHash } from "../src/lib/projectHash.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { evaluateVisualComparisonEligibility } from "../src/lib/visual-comparison/visualComparisonEligibility.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const row = await prisma.generation.findUnique({
    where: { id: generationId },
    include: {
      versions: { orderBy: { versionNumber: "asc" } },
      repairAttempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  if (!row) {
    throw new Error(`Generation ${generationId} not found`);
  }

  const before = {
    activeVersionId: row.activeVersionId,
    latestProjectHash: row.latestProjectHash,
    versionCount: row.versions.length,
    repairStatus: row.repairAttempts.at(-1)?.status ?? null,
    sandboxValidationHash: (row.sandboxValidation as { projectHash?: string } | null)?.projectHash ?? null,
  };

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: row.ownerId,
  });

  if (!record) {
    throw new Error("Hydration failed");
  }

  const exportEligibility = evaluateExportEligibility(record);
  const editEligibility = evaluateEditEligibility(record);
  const compareEligibility = evaluateVisualComparisonEligibility(record);

  const afterRow = await prisma.generation.findUnique({
    where: { id: generationId },
    include: {
      versions: { orderBy: { versionNumber: "asc" } },
      repairAttempts: { orderBy: { attemptNumber: "asc" } },
    },
  });

  console.log(
    JSON.stringify(
      {
        generationId,
        before,
        after: {
          activeVersionId: afterRow?.activeVersionId,
          latestProjectHash: afterRow?.latestProjectHash,
          versionCount: afterRow?.versions.length ?? 0,
          versions: afterRow?.versions.map((version) => ({
            versionNumber: version.versionNumber,
            versionId: version.versionId,
            source: version.source,
            projectHash: version.projectHash,
          })),
          repairStatus: afterRow?.repairAttempts.at(-1)?.status ?? null,
          repairHasSandboxValidationAfter: Boolean(afterRow?.repairAttempts.at(-1)?.sandboxValidationAfter),
        },
        integrity: {
          computedOutputsHash: record.outputs.generatedProject
            ? computeProjectHash(record.outputs.generatedProject)
            : null,
          recordProjectHash: record.projectHash,
          activeVersionProjectHash: record.versions.find((version) => version.versionId === record.activeVersionId)
            ?.projectHash,
        },
        eligibility: {
          export: exportEligibility.ok ? { ok: true } : exportEligibility,
          edit: editEligibility.ok ? { ok: true } : editEligibility,
          compare: compareEligibility.ok ? { ok: true } : compareEligibility,
        },
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
