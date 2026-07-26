/** Create an export for the active project version through ExportService. */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { resolveAppPaths } from "../src/config/paths.js";
import { validateEnv } from "../src/env.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { ExportArtifactStore } from "../src/lib/export/exportArtifactStore.js";
import { ExportService } from "../src/lib/export/ExportService.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const { ownerId } = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true },
  });

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record?.projectHash) {
    throw new Error("Generation has no active project version");
  }

  reconcileGenerationLocksSync(record, { editLockTimeoutMs: 0, visualCaptureTimeoutMs: 0, exportLockTimeoutMs: 0 });
  await store.persist(record);

  const paths = resolveAppPaths(env);
  const service = ExportService.fromEnv(env, new ExportArtifactStore(paths.exportStorageDir));

  const result = await service.createExport(record, { expectedProjectHash: record.projectHash }, randomUUID());
  await store.persist(record);

  console.log(
    JSON.stringify(
      {
        generationId,
        ok: result.ok,
        message: result.ok ? null : result.message,
        errorCode: result.ok ? null : result.errorCode,
        duplicate: result.ok ? result.duplicate : null,
        export: result.ok ? result.summary : null,
        exportInProgress: record.exportInProgress,
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
