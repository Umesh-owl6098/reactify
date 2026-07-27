/** Reconcile locks and complete comparison using an existing 1440x810 PNG capture. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { MockAIProvider } from "@reactify/test-utils";
import { validateEnv } from "../src/env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { createScriptStores } from "./lib/script-storage.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const screenshotPath =
  process.argv[3] ??
  join(process.cwd(), "storage/recovery", generationId, "standalone-1440x810.png");

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

  const { imageStorage, comparisonArtifactStore } = createScriptStores(env);
  const visualComparisonService = VisualComparisonService.fromDeps({
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage,
    artifactStore: comparisonArtifactStore,
  });

  const refreshed = store.get(generationId)!;
  let comparison = refreshed.visualComparisons.find((entry) => entry.status === "awaiting_capture");
  if (!comparison) {
    const createResult = await visualComparisonService.createComparison(refreshed, {
      expectedProjectHash: refreshed.projectHash!,
      viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
    });
    if (!createResult.ok) {
      throw new Error(createResult.message);
    }
    comparison = refreshed.visualComparisons.find((entry) => entry.comparisonId === createResult.comparison.comparisonId);
  }

  if (!comparison) {
    throw new Error("No awaiting_capture comparison available");
  }

  const screenshotBase64 = (await readFile(screenshotPath)).toString("base64");
  const submitResult = await visualComparisonService.submitScreenshot(refreshed, comparison.comparisonId, {
    expectedProjectHash: refreshed.projectHash!,
    viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
    imageFormat: "png",
    screenshotBase64,
    capturedAt: new Date().toISOString(),
  });
  if (!submitResult.ok) {
    throw new Error(submitResult.message);
  }

  await store.persist(refreshed);
  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        generationId,
        comparisonId: submitResult.comparison.comparisonId,
        status: submitResult.comparison.status,
        similarityScore: submitResult.comparison.overallSimilarityScore,
        changedPixelsPercent: submitResult.comparison.pixelDifferencePercentage,
        viewport: submitResult.comparison.viewport,
        editInProgress: refreshed.editInProgress,
        visualComparisonInProgress: refreshed.visualComparisonInProgress,
        previewCaptureRequired: refreshed.previewCaptureRequired,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
