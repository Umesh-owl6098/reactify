/**
 * Verify generation status snapshot matches recovered integrity state.
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
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
    select: { ownerId: true },
  });
  if (!row) {
    throw new Error("Generation not found");
  }

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: row.ownerId,
  });
  if (!record) {
    throw new Error("Hydration failed");
  }

  const snapshot = store.toSnapshot(record);
  console.log(
    JSON.stringify(
      {
        generationId,
        status: snapshot?.status,
        activeVersionId: snapshot?.activeVersionId,
        activeVersionNumber: snapshot?.activeVersionNumber,
        projectHash: snapshot?.projectHash,
        exportAllowed: snapshot?.exportAllowed,
        exportBlockedReason: snapshot?.exportBlockedReason,
        editAllowed: snapshot?.editAllowed,
        editBlockedReason: snapshot?.editBlockedReason,
        visualComparisonAllowed: snapshot?.visualComparisonAllowed,
        visualComparisonBlockedReason: snapshot?.visualComparisonBlockedReason,
        repairStatus: snapshot?.repairStatus,
        repairAttemptStatus: snapshot?.repair?.attempts?.at(-1)?.status ?? null,
        sandboxValidationHash: snapshot?.sandboxValidation?.projectHash ?? null,
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
