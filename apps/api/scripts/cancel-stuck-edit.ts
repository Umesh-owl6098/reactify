/** Cancel the active stuck edit and restore generation to Ready. */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const ownerId = (await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { ownerId: true } }))
    .ownerId;

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record) throw new Error("Hydration failed");

  const activeEdit = record.edits.find((edit) => edit.editId === record.activeEditId) ?? record.edits.at(-1);
  if (activeEdit && activeEdit.status !== "cancelled" && activeEdit.status !== "completed") {
    activeEdit.status = "cancelled";
    activeEdit.completedAt = new Date().toISOString();
  }

  record.status = "Ready";
  record.activeStage = null;
  record.editInProgress = false;
  record.activeEditId = null;
  record.visualComparisonInProgress = false;
  record.exportInProgress = false;
  record.updatedAt = new Date().toISOString();

  store.hydrate([record]);
  await store.persist(record);

  console.log(
    JSON.stringify(
      {
        generationId,
        status: record.status,
        editInProgress: record.editInProgress,
        sandboxValidationHash: record.sandboxValidation?.projectHash ?? null,
        projectHash: record.projectHash,
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
