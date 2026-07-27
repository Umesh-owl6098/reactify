/**
 * Recover a ready export archive through reconstruction + durable storage.
 */
import { PrismaClient } from "@prisma/client";
import JSZip from "jszip";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";
import { ExportService } from "../src/lib/export/ExportService.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { createScriptStores } from "./lib/script-storage.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const exportId = process.argv[3] ?? "75e42c99-fef8-4f43-964c-b9918c28a0ea";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const { exportArtifactStore } = createScriptStores(env);
  await exportArtifactStore.ensureReady();
  const exportService = ExportService.fromEnv(env, exportArtifactStore);

  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const row = await prisma.projectExport.findUnique({ where: { exportId } });
  if (!row) {
    throw new Error(`Export ${exportId} not found`);
  }

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: (await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { ownerId: true } }))
      .ownerId,
  });
  if (!record) {
    throw new Error("Generation hydration failed");
  }

  const beforeExists = await exportArtifactStore.archiveExists(generationId, exportId);
  const download = await exportService.resolveDownload(record, exportId);
  if (!download.ok) {
    throw new Error(JSON.stringify(download));
  }

  if (download.reconstructed) {
    await store.persist(record);
  }

  const afterRow = await prisma.projectExport.findUnique({ where: { exportId } });
  const afterExists = await exportArtifactStore.archiveExists(generationId, exportId);
  const zip = await JSZip.loadAsync(download.buffer);
  const entries = Object.keys(zip.files).filter((entry) => !zip.files[entry]!.dir);

  console.log(
    JSON.stringify(
      {
        generationId,
        exportId,
        before: {
          status: row.status,
          filename: row.filename,
          versionNumber: row.versionNumber,
          versionId: row.versionId,
          artifactReference: row.artifactReference,
          archiveExists: beforeExists,
        },
        after: {
          artifactReference: afterRow?.artifactReference,
          archiveExists: afterExists,
          storageRoot: exportArtifactStore.getRootDir(),
          resolvedPath: exportArtifactStore.resolveArchivePath(generationId, exportId),
          checksum: exportArtifactStore.computeChecksum(download.buffer),
          zipEntryCount: entries.length,
          filename: download.filename,
          byteLength: download.buffer.byteLength,
          reconstructed: download.reconstructed,
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
