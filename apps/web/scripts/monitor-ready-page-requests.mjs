import { chromium } from "playwright";

const GENERATION_ID = process.argv[2] ?? "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";
const BASE_URL = process.env.WEB_URL ?? "http://localhost:5174";
const DURATION_MS = Number(process.env.MONITOR_MS ?? 120_000);

function countMatching(urls, pattern) {
  return urls.filter((url) => url.includes(pattern)).length;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requestUrls = [];

  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/generations/")) {
      requestUrls.push(url);
    }
  });

  await page.goto(`${BASE_URL}/generations/${GENERATION_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(DURATION_MS);

  const edits = countMatching(requestUrls, `/api/v1/generations/${GENERATION_ID}/edits`);
  const comparisons = countMatching(
    requestUrls,
    `/api/v1/generations/${GENERATION_ID}/visual-comparisons`,
  );
  const generationStatus = countMatching(requestUrls, `/api/v1/generations/${GENERATION_ID}`);

  console.log(
    JSON.stringify(
      {
        generationId: GENERATION_ID,
        durationMs: DURATION_MS,
        totals: {
          edits,
          visualComparisons: comparisons,
          generationStatus,
          allGenerationApiRequests: requestUrls.length,
        },
        stable: edits <= 2 && comparisons <= 2,
      },
      null,
      2,
    ),
  );

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
