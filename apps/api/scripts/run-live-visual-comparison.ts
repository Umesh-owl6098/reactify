/**
 * End-to-end visual comparison against a live preview.
 *
 * The server resolves the capture viewport from the uploaded source dimensions,
 * so the browser must be sized from the created record rather than from a
 * hard-coded guess. A blank capture is rejected before it is submitted.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { MockAIProvider } from "@reactify/test-utils";
import { resolveAppPaths } from "../src/config/paths.js";
import { validateEnv } from "../src/env.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { ImageStorage } from "../src/lib/imageStorage.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { ComparisonArtifactStore } from "../src/lib/visual-comparison/comparisonArtifactStore.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";

const require = createRequire(import.meta.url);
const { chromium } = require("../../web/node_modules/playwright");

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const previewUrl = process.argv[3] ?? "http://127.0.0.1:5199/";
const requestedWidth = Number(process.argv[4] ?? 1440);

/** A capture is only usable when the rendered page actually painted something. */
async function captureStablePreview(url: string, width: number, height: number) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    await page.evaluate(() => document.fonts?.ready);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );

    const dom = await page.evaluate(() => {
      const root = document.getElementById("root") ?? document.body;
      const rect = root.getBoundingClientRect();
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        childElements: root.querySelectorAll("*").length,
        text: (root.textContent ?? "").trim().slice(0, 200),
      };
    });

    if (dom.width === 0 || dom.height === 0 || dom.childElements === 0) {
      throw new Error(`Preview DOM is blank: ${JSON.stringify(dom)}`);
    }

    const screenshot: Buffer = await page.screenshot({ fullPage: false });
    return { screenshot, dom };
  } finally {
    await browser.close();
  }
}

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
  const service = VisualComparisonService.fromDeps({
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage: new ImageStorage(paths.imageStorageDir),
    artifactStore: new ComparisonArtifactStore(paths.comparisonStorageDir),
  });

  const refreshed = store.get(generationId)!;
  const created = await service.createComparison(
    refreshed,
    {
      expectedProjectHash: refreshed.projectHash!,
      // Height is a request only. The service overrides it from the real source
      // aspect ratio, which is exactly what we then capture at.
      viewport: { width: requestedWidth, height: Math.round(requestedWidth * 0.5625), deviceScaleFactor: 1 },
    },
    randomUUID(),
  );

  if (!created.ok) {
    throw new Error(`createComparison failed: ${created.message}`);
  }

  const resolved = created.comparison.viewport;
  const { screenshot, dom } = await captureStablePreview(previewUrl, resolved.width, resolved.height);

  const outputDir = join(process.cwd(), "storage/recovery", generationId);
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, `preview-${resolved.width}x${resolved.height}.png`), screenshot);

  await store.persist(refreshed);

  const submitted = await service.submitScreenshot(refreshed, created.comparison.comparisonId, {
    expectedProjectHash: refreshed.projectHash!,
    viewport: resolved,
    imageFormat: "png",
    screenshotBase64: screenshot.toString("base64"),
    capturedAt: new Date().toISOString(),
  });

  if (!submitted.ok) {
    throw new Error(`submitScreenshot failed: ${submitted.message}`);
  }

  await store.persist(refreshed);

  const comparison = submitted.comparison;
  console.log(
    JSON.stringify(
      {
        generationId,
        comparisonId: comparison.comparisonId,
        status: comparison.status,
        resolvedViewport: resolved,
        previewDom: dom,
        sourceImage: comparison.sourceImage,
        previewImage: comparison.previewImage,
        overallSimilarityScore: comparison.overallSimilarityScore,
        pixelDifferencePercentage: comparison.pixelDifferencePercentage,
        structuralDifferenceScore: comparison.structuralDifferenceScore,
        regionCount: comparison.regions.length,
        highSeverityRegions: comparison.regions.filter((region) => region.severity === "high").length,
        artifacts: comparison.artifacts,
        visualComparisonInProgress: refreshed.visualComparisonInProgress,
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
