import { PrismaClient } from "@prisma/client";
import JSZip from "jszip";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { validateJobPayloadForEnqueue } from "../src/jobs/job-contracts.js";
import { ExportService } from "../src/lib/export/ExportService.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";

const generationId = process.argv[2] ?? "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const owner = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { ownerId: true, status: true },
  });
  if (!owner) {
    throw new Error("Generation not found");
  }

  const record = await hydrateOwnedGenerationRecord({
    store,
    persistence,
    generationId,
    ownerId: owner.ownerId,
  });
  if (!record) {
    throw new Error("Hydration failed");
  }

  const exportService = ExportService.fromEnv(env);
  const activeVersionId = record.activeVersionId ?? record.projectHash;
  if (!activeVersionId || !record.projectHash) {
    throw new Error("Generation is missing active version metadata");
  }

  validateJobPayloadForEnqueue("export_preparation", {
    generationId,
    exportId: "880e8400-e29b-41d4-a716-446655440000",
    versionId: activeVersionId,
    expectedProjectHash: record.projectHash,
    projectName: "SuspensionBridgeLandscape",
    includeMetadata: true,
    includeGenerationSummary: true,
  });

  const result = await exportService.createExport(record, {
    projectName: "SuspensionBridgeLandscape",
    includeMetadata: true,
    includeGenerationSummary: true,
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }

  const exportRecord = exportService.getExport(record, result.summary.exportId);
  const zip = await JSZip.loadAsync(exportRecord!.zipBuffer!);
  const entries = Object.keys(zip.files).filter((entry) => !zip.files[entry]!.dir);

  console.info(
    JSON.stringify(
      {
        generationStatus: owner.status,
        exportStatus: result.summary.status,
        versionId: result.summary.versionId,
        filename: result.summary.filename,
        zipEntryCount: entries.length,
        hasPackageJson: entries.some((entry) => entry.endsWith("package.json")),
        hasReadme: entries.some((entry) => entry.endsWith("README.md")),
        hasMetadata: entries.some((entry) => entry.endsWith("reactify-manifest.json")),
        hasSummary: entries.some((entry) => entry.endsWith("reactify-generation-summary.json")),
        sampleEntries: entries.slice(0, 12),
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
