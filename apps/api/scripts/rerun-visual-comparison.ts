/** Reconcile locks, create a fresh comparison, and submit a preview screenshot. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { MockAIProvider } from "@reactify/test-utils";
import { resolveAppPaths } from "../src/config/paths.js";
import { validateEnv } from "../src/env.js";
import { buildEditSnapshotFields } from "../src/lib/edit/editEligibility.js";
import { buildExportSnapshotFields } from "../src/lib/export/exportEligibility.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { ImageStorage } from "../src/lib/imageStorage.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { ComparisonArtifactStore } from "../src/lib/visual-comparison/comparisonArtifactStore.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const screenshotPath =
  process.argv[3] ??
  join(process.cwd(), "storage/recovery", generationId, "standalone-1440x810.png");
const viewport = { width: 1440, height: 810, deviceScaleFactor: 1 as const };

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();
  const persistence = new PersistenceService(prisma);
  const store = new GenerationStore(DEFAULT_FEATURE_FLAGS, 3);
  store.setPersistHandler(async (record) => persistence.generations.save(record));

  const ownerId = (await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { ownerId: true } }))
    .ownerId;

  const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
  if (!record?.projectHash) {
    throw new Error("Generation unavailable");
  }

  reconcileGenerationLocksSync(record, { editLockTimeoutMs: 0, visualCaptureTimeoutMs: 0 });
  await store.persist(record);

  const paths = resolveAppPaths(env);
  const visualComparisonService = VisualComparisonService.fromDeps({
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage: new ImageStorage(paths.imageStorageDir),
    artifactStore: new ComparisonArtifactStore(paths.comparisonStorageDir),
  });

  const refreshed = store.get(generationId)!;
  const createResult = await visualComparisonService.createComparison(
    refreshed,
    {
      expectedProjectHash: refreshed.projectHash!,
      viewport,
    },
    randomUUID(),
  );
  if (!createResult.ok) {
    throw new Error(createResult.message);
  }

  const screenshotBase64 = (await readFile(screenshotPath)).toString("base64");
  const submitResult = await visualComparisonService.submitScreenshot(refreshed, createResult.comparison.comparisonId, {
    expectedProjectHash: refreshed.projectHash!,
    viewport,
    imageFormat: "png",
    screenshotBase64,
    capturedAt: new Date().toISOString(),
  });
  if (!submitResult.ok) {
    throw new Error(submitResult.message);
  }

  await store.persist(refreshed);

  const editFields = buildEditSnapshotFields(refreshed);
  const exportFields = buildExportSnapshotFields(refreshed);

  console.log(
    JSON.stringify(
      {
        generationId,
        status: refreshed.status,
        comparisonId: submitResult.comparison.comparisonId,
        comparisonStatus: submitResult.comparison.status,
        sourceImage: submitResult.comparison.sourceImage,
        previewImage: submitResult.comparison.previewImage,
        viewport: submitResult.comparison.viewport,
        overallSimilarityScore: submitResult.comparison.overallSimilarityScore,
        pixelDifferencePercentage: submitResult.comparison.pixelDifferencePercentage,
        structuralDifferenceScore: submitResult.comparison.structuralDifferenceScore,
        regionCount: submitResult.comparison.regions.length,
        editInProgress: refreshed.editInProgress,
        editAllowed: editFields.editAllowed,
        editBlockedReason: editFields.editBlockedReason,
        exportAllowed: exportFields.exportAllowed,
        exportBlockedReason: exportFields.exportBlockedReason,
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
