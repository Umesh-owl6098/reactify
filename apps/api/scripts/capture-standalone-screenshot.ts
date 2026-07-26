import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runVisualComparison } from "../src/lib/visual-comparison/comparisonEngine.js";
import { testEnv } from "../src/test/helpers.js";

const require = createRequire(import.meta.url);
const { chromium } = require("../../web/node_modules/playwright");

const STANDALONE_URL = process.argv[2] ?? "http://127.0.0.1:5199/";
const SOURCE_IMAGE = process.argv[3] ??
  "/Users/umeshchowdaryballa/Desktop/reactify/apps/api/storage/images/04d38b90-4f2e-47c2-b5a3-37979305773e";
const OUTPUT_DIR =
  process.argv[4] ??
  "/Users/umeshchowdaryballa/Desktop/reactify/apps/api/storage/recovery/8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 810;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } });
  await page.goto(STANDALONE_URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const screenshotPath = join(OUTPUT_DIR, "standalone-1440x810.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await browser.close();

  const source = await readFile(SOURCE_IMAGE);
  const preview = await readFile(screenshotPath);
  const comparison = await runVisualComparison(
    source,
    preview,
    { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    testEnv,
  );

  await writeFile(
    join(OUTPUT_DIR, "visual-comparison-result.json"),
    JSON.stringify(
      {
        screenshotPath,
        sourceImage: SOURCE_IMAGE,
        overallSimilarityScore: comparison.overallSimilarityScore,
        pixelDifferencePercentage: comparison.pixelDifferencePercentage,
        structuralDifferenceScore: comparison.structuralDifferenceScore,
        regionCount: comparison.regions.length,
        layoutRegions: comparison.regions.filter((region) => region.category === "layout").length,
        summary: comparison.summary,
      },
      null,
      2,
    ),
  );

  console.log(
    JSON.stringify(
      {
        screenshotPath,
        overallSimilarityScore: comparison.overallSimilarityScore,
        pixelDifferencePercentage: comparison.pixelDifferencePercentage,
        layoutRegions: comparison.regions.filter((region) => region.category === "layout").length,
        summary: comparison.summary,
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
