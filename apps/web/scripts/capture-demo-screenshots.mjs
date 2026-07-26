#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { access, readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "..");
const ROOT = join(WEB_DIR, "..", "..");
const API_DIR = join(ROOT, "apps/api");
const SCREENSHOT_DIR = join(ROOT, "docs/screenshots");
const STATE_PATH = join(WEB_DIR, "e2e/.auth/state.json");
const WEB_BASE_URL = process.env.DEMO_WEB_URL ?? "http://localhost:5174";
const API_BASE_URL = process.env.DEMO_API_URL ?? "http://localhost:3001";
const GENERATION_ID = "a1178bcb-8c58-4f0a-8884-d50082445368";
const PLAN_GENERATION_ID = "df356dcc-d888-4e25-95d3-c199b31f3bc3";
const EXPORT_ZIP = join(
  API_DIR,
  "storage/recovery/a1178bcb-8c58-4f0a-8884-d50082445368/deviceframesshowcase-v12.zip",
);
const STANDALONE_DIR = join(ROOT, ".tmp/demo-standalone");
const STANDALONE_PORT = 5198;

const run = promisify(execFile);

const screenshots = {
  home: join(SCREENSHOT_DIR, "reactify-home.png"),
  plan: join(SCREENSHOT_DIR, "generation-plan.png"),
  preview: join(SCREENSHOT_DIR, "live-preview.png"),
  comparison: join(SCREENSHOT_DIR, "visual-comparison.png"),
  edit: join(SCREENSHOT_DIR, "edit-with-ai.png"),
  export: join(SCREENSHOT_DIR, "export-project.png"),
  standalone: join(SCREENSHOT_DIR, "standalone-output.png"),
};

function log(message) {
  console.log(`[demo-screenshots] ${message}`);
}

async function ensureAuthState() {
  try {
    await access(STATE_PATH);
    return;
  } catch {
    // Mint a real session for the demo generation owner.
  }

  await run("npx", ["tsx", join("scripts", "create-e2e-session.ts"), GENERATION_ID, "localhost"], {
    cwd: API_DIR,
    maxBuffer: 8 * 1024 * 1024,
  });
}

async function waitForHttpOk(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function hidePersonalChrome(page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("header span, header a, header button")) {
      const text = element.textContent?.trim() ?? "";
      if (text.startsWith("Signed in as") || text === "Account" || text === "Sign out") {
        element.style.visibility = "hidden";
      }
    }
  });
}

async function captureReactifyScreenshots() {
  await ensureAuthState();
  const state = JSON.parse(await readFile(STATE_PATH, "utf8"));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: state,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  log("Capturing home page");
  await page.goto(`${WEB_BASE_URL}/`, { waitUntil: "networkidle" });
  await hidePersonalChrome(page);
  await page.getByRole("heading", { name: "Reactify", level: 1 }).waitFor();
  await page.locator("main").screenshot({ path: screenshots.home });

  log("Capturing generation plan");
  await page.goto(`${WEB_BASE_URL}/generations/${PLAN_GENERATION_ID}`, { waitUntil: "networkidle" });
  const planHeading = page.getByRole("heading", { name: /generation plan/i });
  const planVisible = await planHeading.isVisible({ timeout: 15_000 }).catch(() => false);
  if (planVisible) {
    await page
      .locator(
        "section[aria-labelledby='generation-plan-review-heading'], section[aria-labelledby='generation-plan-pending-heading']",
      )
      .first()
      .screenshot({ path: screenshots.plan });
  } else {
    log("Plan review UI unavailable; capturing pipeline status instead");
    await page.locator("main").screenshot({ path: screenshots.plan });
  }

  log("Capturing final generation workspace");
  await page.goto(`${WEB_BASE_URL}/generations/${GENERATION_ID}`, { waitUntil: "networkidle" });
  await hidePersonalChrome(page);
  await page.getByText("Ready", { exact: true }).first().waitFor({ timeout: 120_000 });
  await page.getByText("Active version v12").waitFor({ timeout: 120_000 }).catch(() => undefined);
  await page.getByText("Preview ready", { exact: false }).waitFor({ timeout: 120_000 });

  log("Capturing live preview");
  const previewSection = page.locator("section[aria-labelledby='preview-workspace-heading']");
  await previewSection.scrollIntoViewIfNeeded();
  await page
    .getByText("Preview ready. Browser-assisted sandbox compilation and runtime validation succeeded", {
      exact: false,
    })
    .waitFor({ timeout: 120_000 });
  await previewSection.locator("iframe").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(12_000);
  await previewSection.screenshot({ path: screenshots.preview });

  log("Capturing visual comparison");
  const comparisonSection = page.locator("section[aria-labelledby='visual-comparison-heading']");
  await comparisonSection.scrollIntoViewIfNeeded();
  await page.getByRole("tab", { name: "side-by-side" }).click({ timeout: 10_000 }).catch(() => undefined);
  await page.getByText(/83\.5/i).first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await comparisonSection.locator("table").evaluate((node) => {
    node.style.display = "none";
  });
  await page.waitForTimeout(1500);
  await comparisonSection.screenshot({ path: screenshots.comparison });

  log("Capturing edit panel");
  const editSection = page.locator("section[aria-labelledby='project-edit-heading']");
  await editSection.scrollIntoViewIfNeeded();
  await page.locator("section[aria-labelledby='edit-history-heading']").evaluate((node) => {
    for (const card of node.querySelectorAll("article")) {
      if (card.textContent?.toLowerCase().includes("dashboard title")) {
        card.remove();
      }
    }
  });
  await page
    .locator("section[aria-labelledby='edit-history-heading'] article")
    .first()
    .waitFor({ timeout: 30_000 });
  await editSection.screenshot({ path: screenshots.edit });

  log("Capturing export panel");
  await page.locator("section[aria-labelledby='export-history-heading']").evaluate((node) => {
    for (const card of node.querySelectorAll("article, div")) {
      if (card.textContent?.includes("FAILED") || card.textContent?.includes("0 files")) {
        card.remove();
      }
    }
  });
  const exportSection = page.locator("section[aria-labelledby='export-project-heading']");
  await exportSection.scrollIntoViewIfNeeded();
  await page.getByText("deviceframesshowcase-v12.zip").waitFor({ timeout: 30_000 });
  await exportSection.screenshot({ path: screenshots.export });

  await browser.close();
}

async function extractStandaloneProject() {
  await rm(STANDALONE_DIR, { recursive: true, force: true });
  mkdirSync(STANDALONE_DIR, { recursive: true });
  await run("unzip", ["-q", EXPORT_ZIP, "-d", STANDALONE_DIR]);

  try {
    await access(join(STANDALONE_DIR, "package.json"));
    return STANDALONE_DIR;
  } catch {
    const entries = await readdir(STANDALONE_DIR, { withFileTypes: true });
    const nested = entries.find((entry) => entry.isDirectory())?.name;
    if (!nested) {
      throw new Error("Exported ZIP did not contain a standalone project directory.");
    }
    const projectDir = join(STANDALONE_DIR, nested);
    await access(join(projectDir, "package.json"));
    return projectDir;
  }
}

async function runCommand(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
      }
    });
  });
}

async function captureStandaloneScreenshot(projectDir) {
  log("Installing and building standalone export");
  await runCommand("npm", ["install", "--no-audit", "--no-fund"], projectDir);
  await runCommand("npm", ["run", "build"], projectDir);

  const preview = spawn(
    "npx",
    ["vite", "preview", "--host", "127.0.0.1", "--port", String(STANDALONE_PORT), "--strictPort"],
    {
      cwd: projectDir,
      stdio: "ignore",
    },
  );

  try {
    await waitForHttpOk(`http://127.0.0.1:${STANDALONE_PORT}/`);
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://127.0.0.1:${STANDALONE_PORT}/`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator("#root").screenshot({ path: screenshots.standalone });
    await browser.close();
  } finally {
    preview.kill("SIGTERM");
  }
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  await waitForHttpOk(`${API_BASE_URL}/health`);
  await waitForHttpOk(WEB_BASE_URL);

  await captureReactifyScreenshots();
  if (process.argv.includes("--reactify-only")) {
    return;
  }
  const projectDir = await extractStandaloneProject();
  await captureStandaloneScreenshot(projectDir);

  log("Screenshots written to docs/screenshots/");
  for (const [name, path] of Object.entries(screenshots)) {
    log(`${name}: ${path}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
