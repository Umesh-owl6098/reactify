/**
 * Recover a stuck generation and verify API exposure without rerunning the pipeline.
 */
import { PrismaClient } from "@prisma/client";
import { GenerationStore } from "../src/pipeline/store.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";

const generationId = process.argv[2] ?? "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";

async function main() {
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => {
    await persistence.generations.save(record);
  });

  const row = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { ownerId: true, status: true, activeVersionId: true, awaitingSandboxValidation: true },
  });

  if (!row) {
    throw new Error(`Generation ${generationId} not found`);
  }

  console.log("before", row);

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: row.ownerId,
  });

  if (!record) {
    throw new Error("Hydration failed");
  }

  const after = await prisma.generation.findUnique({
    where: { id: generationId },
    select: {
      status: true,
      activeVersionId: true,
      awaitingSandboxValidation: true,
      latestProjectHash: true,
      versions: { select: { versionId: true, versionNumber: true }, orderBy: { versionNumber: "asc" } },
    },
  });

  console.log(
    JSON.stringify(
      {
        generationId,
        recovered: Boolean(after?.activeVersionId),
        activeVersionId: after?.activeVersionId,
        versionCount: after?.versions.length ?? 0,
        hasGeneratedProject: Boolean(record.outputs.generatedProject),
        projectFileCount: record.outputs.generatedProject?.files.length ?? 0,
        snapshotProjectName: record.outputs.generatedProject?.projectName ?? null,
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
