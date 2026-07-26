/**
 * Recover a stuck visual comparison by reconciling locks, creating a 1440x810 comparison,
 * capturing the Sandpack preview in-browser, and uploading the screenshot.
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { MockAIProvider } from "@reactify/test-utils";
import { SessionService } from "../src/auth/SessionService.js";
import { validateEnv } from "../src/env.js";
import { resolveAppPaths } from "../src/config/paths.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { ComparisonArtifactStore } from "../src/lib/visual-comparison/comparisonArtifactStore.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { ImageStorage } from "../src/lib/imageStorage.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";

const require = createRequire(import.meta.url);
const { chromium } = require(join(dirname(fileURLToPath(import.meta.url)), "../../web/node_modules/playwright"));

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const webBaseUrl = process.argv[3] ?? "http://localhost:5174";

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
  const imageStorage = new ImageStorage(paths.imageStorageDir);
  const artifactStore = new ComparisonArtifactStore(paths.comparisonStorageDir);
  const visualComparisonService = VisualComparisonService.fromDeps({
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage,
    artifactStore,
  });

  const refreshed = store.get(generationId)!;
  const createResult = await visualComparisonService.createComparison(refreshed, {
    expectedProjectHash: refreshed.projectHash!,
    viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
  });
  if (!createResult.ok) {
    throw new Error(createResult.message);
  }
  await store.persist(refreshed);

  const comparisonId = createResult.comparison.comparisonId;
  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: ownerId, token });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 810 } });
  await context.addCookies([
    {
      name: "reactify_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${webBaseUrl}/generations/${generationId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-sandpack-preview-root]", { timeout: 90000 });
  await page.waitForTimeout(3000);

  const screenshotBase64 = (await page.screenshot({ type: "png", fullPage: false })).toString("base64");

  const submitResult = await visualComparisonService.submitScreenshot(refreshed, comparisonId, {
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
  await context.close();
  await browser.close();
  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        generationId,
        comparisonId,
        status: submitResult.comparison.status,
        similarityScore: submitResult.comparison.overallSimilarityScore,
        changedPixelsPercent: submitResult.comparison.pixelDifferencePercentage,
        viewport: submitResult.comparison.viewport,
        editInProgress: refreshed.editInProgress,
        visualComparisonInProgress: refreshed.visualComparisonInProgress,
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
