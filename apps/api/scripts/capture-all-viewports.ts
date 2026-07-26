import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runVisualComparison } from "../src/lib/visual-comparison/comparisonEngine.js";
import { testEnv } from "../src/test/helpers.js";

const require = createRequire(import.meta.url);
const { chromium } = require(join(dirname(fileURLToPath(import.meta.url)), "../../web/node_modules/playwright"));

const STANDALONE_URL = process.argv[2] ?? "http://127.0.0.1:5199/";
const SOURCE_IMAGE =
  process.argv[3] ??
  "/Users/umeshchowdaryballa/Desktop/reactify/apps/api/storage/images/04d38b90-4f2e-47c2-b5a3-37979305773e";
const OUTPUT_DIR =
  process.argv[4] ??
  "/Users/umeshchowdaryballa/Desktop/reactify/apps/api/storage/recovery/8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

const VIEWPORTS = [
  { name: "1440x810", width: 1440, height: 810 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "512x288", width: 512, height: 288 },
] as const;

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const source = await readFile(SOURCE_IMAGE);
  const browser = await chromium.launch({ headless: true });
  const results: Record<string, unknown>[] = [];

  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await page.goto(STANDALONE_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const screenshotPath = join(OUTPUT_DIR, `standalone-${viewport.name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await page.close();

    const preview = await readFile(screenshotPath);
    const comparison = await runVisualComparison(
      source,
      preview,
      { width: viewport.width, height: viewport.height },
      testEnv,
    );

    results.push({
      viewport: viewport.name,
      screenshotPath,
      overallSimilarityScore: comparison.overallSimilarityScore,
      pixelDifferencePercentage: comparison.pixelDifferencePercentage,
      layoutRegions: comparison.regions.filter((region) => region.category === "layout").length,
      regionCount: comparison.regions.length,
      summary: comparison.summary,
    });
  }

  await browser.close();

  const payload = {
    comparedAt: new Date().toISOString(),
    sourceImage: SOURCE_IMAGE,
    results,
  };

  await writeFile(join(OUTPUT_DIR, "visual-comparison-all-viewports.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
