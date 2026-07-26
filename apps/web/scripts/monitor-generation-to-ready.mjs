import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GENERATION_ID = process.argv[2];
const REPORT_PATH = join(__dirname, "e2e-full-generation-report.json");
if (!GENERATION_ID) {
  console.error("Usage: node monitor-generation-to-ready.mjs <generationId>");
  process.exit(1);
}

function inspectDb(id) {
  const out = execSync(
    `cd "${join(__dirname, "../../api")}" && corepack pnpm exec tsx scripts/inspect-generation-jobs.ts "${id}"`,
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

async function ensureSignedIn(page) {
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
  const text = await page.locator("body").innerText();
  if (text.includes("Project history") || text.includes("Signed in as")) return;

  await page.goto("http://localhost:5174/sign-in", { waitUntil: "networkidle" });
  let email = process.env.E2E_EMAIL;
  if (!email && existsSync(REPORT_PATH)) {
    const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
    const signedInStage = report.stages?.find((s) => s.name === "registered_and_signed_in");
    email = signedInStage?.email;
  }
  if (!email) {
    throw new Error("No E2E account email available for sign-in");
  }
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/^password$/i).fill("secure-password-123");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("http://localhost:5174/", { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await ensureSignedIn(page);
  await page.goto(`http://localhost:5174/generations/${GENERATION_ID}`, { waitUntil: "networkidle" });

  for (let i = 0; i < 360; i++) {
    const db = inspectDb(GENERATION_ID);
    const status = db.generation?.status;
    const jobs = db.jobs?.map((j) => `${j.jobType}:${j.status}`).join(", ");
    const text = await page.locator("body").innerText();
    const hasPreview = (await page.locator("[data-sandpack-preview-root]").count()) > 0;
    const previewReady = text.includes("Preview ready");
    const pipeline = text.includes("Generation pipeline");
    const blank = text.trim().length < 80;
    const current = text.match(/Current status: ([^\n]+)/)?.[1] ?? null;

    console.log(`[${i}] db=${status} ui=${current} pipeline=${pipeline} preview=${previewReady || hasPreview} jobs=${jobs}`);

    if (status === "Ready" && (previewReady || hasPreview) && pipeline) {
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(3000);
      const reopen = await page.locator("body").innerText();
      console.log("SUCCESS", {
        generationId: GENERATION_ID,
        status,
        url: page.url(),
        previewReady: reopen.includes("Preview ready"),
        hasPreviewRoot: (await page.locator("[data-sandpack-preview-root]").count()) > 0,
        reservations: db.reservations?.map((r) => ({ provider: r.provider, model: r.model })),
        repairAttempts: db.generation?.repairCount ?? 0,
        pageErrors: errors,
      });
      await browser.close();
      return;
    }

    if (status === "Failed") {
      console.log("FAILED", { status, errors: db.generation?.errorMessage, pageErrors: errors });
      await browser.close();
      process.exit(1);
    }

    if (i > 0 && i % 12 === 0) {
      await page.reload({ waitUntil: "networkidle" });
      if (blank) console.log("WARN blank after refresh, waiting...");
    }

    await page.waitForTimeout(5000);
  }

  console.log("TIMEOUT");
  await browser.close();
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
