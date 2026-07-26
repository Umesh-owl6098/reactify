import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "../../api/test-fixtures/login-form-screenshot.png");
const REPORT_PATH = join(__dirname, "e2e-full-generation-report.json");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const POLL_MS = 5000;
const MAX_POLLS = 720; // up to 60 minutes

const report = {
  startedAt: new Date().toISOString(),
  generationId: null,
  finalUrl: null,
  finalStatus: null,
  stages: [],
  refreshes: [],
  consoleErrors: [],
  pageErrors: [],
  networkFailures: [],
  apiSnapshots: [],
  dbSnapshots: [],
  planReview: null,
  preview: null,
  openAiEvidence: null,
  repairAttempts: null,
  sandboxValidation: null,
  compileDurationMs: null,
  success: false,
};

function logStage(name, detail = {}) {
  const entry = { at: new Date().toISOString(), name, ...detail };
  report.stages.push(entry);
  console.log(`[stage] ${name}`, detail.text ? detail.text.slice(0, 120) : "");
}

function bodySignals(text) {
  const currentStatus = text.match(/Current status: ([^\n]+)/)?.[1] ?? null;
  return {
    blank: text.trim().length < 80,
    loading: text.includes("Loading generation details"),
    pipeline: text.includes("Generation pipeline"),
    analyzing: currentStatus === "Analyzing design" || text.includes("Analyzing screenshot"),
    planning: currentStatus === "Planning",
    planReview: text.includes("Review generation plan"),
    preparingPlan: text.includes("Preparing generation plan"),
    awaitingPlan: text.includes("Awaiting plan confirmation"),
    generating: currentStatus === "Generating",
    validating: currentStatus === "Validating",
    compiling: currentStatus === "Compiling",
    repairing: currentStatus === "Repairing" || currentStatus === "Repair required",
    ready: currentStatus === "Ready",
    failed: text.includes("Generation failed") || currentStatus === "Failed",
    loadError: text.includes("Unable to load generation"),
    crash: text.includes("Maximum update depth") || text.includes("Reactify hit an unexpected error"),
    previewReady: text.includes("Preview ready"),
    sandpackPreview: text.includes("data-sandpack-preview-root") || text.includes("Preview ready"),
    generatedProjectView: text.includes("Review the generated React project"),
    jobNotFound: text.includes("JOB_NOT_FOUND") || text.includes("background job for this step was never created"),
    currentStatus,
  };
}

async function ensureSignedIn(page) {
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
  const homeText = await page.locator("body").innerText();
  if (homeText.includes("Project history") || homeText.includes("Signed in as")) {
    logStage("signed_in_existing_session");
    return;
  }
  if (page.url().includes("/sign-in")) {
    await page.getByRole("link", { name: /create one/i }).click();
    const email = `e2e-${Date.now()}@example.com`;
    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/display name/i).fill("E2E User");
    await page.getByLabel(/^password$/i).fill("secure-password-123");
    await page.getByLabel(/confirm password/i).fill("secure-password-123");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL("http://localhost:5174/", { timeout: 20000 });
    logStage("registered_and_signed_in", { email });
  }
}

async function uploadFromHomepage(page) {
  await page.goto("http://localhost:5174/", { waitUntil: "networkidle" });
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(FIXTURE);
  await page.waitForURL(/\/generations\/[0-9a-f-]{36}/i, { timeout: 120000 });
  const generationId = page.url().match(UUID_RE)?.[0] ?? null;
  report.generationId = generationId;
  report.finalUrl = page.url();
  logStage("upload_navigated", { generationId, url: page.url() });
  return generationId;
}

async function refreshAndCheck(page, label) {
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  const signals = bodySignals(text);
  report.refreshes.push({ label, at: new Date().toISOString(), signals });
  logStage(`refresh_${label}`, signals);
  return signals;
}

function inspectDb(generationId) {
  try {
    const out = execSync(
      `cd "${join(__dirname, "../../api")}" && corepack pnpm exec tsx scripts/inspect-generation-jobs.ts "${generationId}"`,
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env },
    );
    const parsed = JSON.parse(out);
    report.dbSnapshots.push({
      at: new Date().toISOString(),
      generationStatus: parsed.generation?.status ?? null,
      awaitingPlanConfirmation: parsed.generation?.awaitingPlanConfirmation ?? null,
      jobs: (parsed.jobs ?? []).map((j) => ({ id: j.id, type: j.type, status: j.status })),
      attempts: (parsed.attempts ?? []).length,
      reservations: (parsed.reservations ?? []).map((r) => ({
        provider: r.provider,
        model: r.model,
        status: r.status,
      })),
    });
    return parsed;
  } catch (error) {
    report.dbSnapshots.push({ at: new Date().toISOString(), error: String(error) });
    return null;
  }
}

async function fetchGenerationSnapshot(page, generationId) {
  const result = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 4000) };
  }, generationId);
  report.apiSnapshots.push({ at: new Date().toISOString(), ...result });
  if (result.status === 200) {
    try {
      return JSON.parse(result.body);
    } catch {
      return null;
    }
  }
  return null;
}

function assessOpenAiEvidence(snapshot, db) {
  const reservations = db?.reservations ?? [];
  const openAiReservation = reservations.find((r) => r.provider === "openai");
  const analysis = snapshot?.outputs?.designAnalysis ?? snapshot?.analysis;
  const plan = snapshot?.outputs?.generationPlan ?? snapshot?.plan;
  const mockLike =
    JSON.stringify({ analysis, plan }).includes("mock-provider") ||
    JSON.stringify({ analysis, plan }).includes("MockComponent") ||
    JSON.stringify({ analysis, plan }).includes("fixture-only");
  report.openAiEvidence = {
    reservationProvider: openAiReservation?.provider ?? reservations[0]?.provider ?? null,
    reservationModel: openAiReservation?.model ?? reservations[0]?.model ?? null,
    hasDesignAnalysis: Boolean(analysis),
    hasGenerationPlan: Boolean(plan),
    appearsMockLike: mockLike,
    analysisSummary: analysis?.summary ?? analysis?.pageTitle ?? null,
    planComponentCount: plan?.components?.length ?? null,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error") report.consoleErrors.push(text);
    if (text.includes("[sandpack]")) {
      logStage("sandpack_log", { text });
      const durationMatch = text.match(/durationMs":\s*(\d+)/);
      if (text.includes("compile_finished") && durationMatch) {
        report.compileDurationMs = Number(durationMatch[1]);
      }
    }
  });
  page.on("pageerror", (err) => report.pageErrors.push(err.message));
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/v1/") && response.status() >= 400) {
      report.networkFailures.push({ url, status: response.status() });
    }
  });

  await ensureSignedIn(page);
  const generationId = await uploadFromHomepage(page);
  if (!generationId) throw new Error("No generation UUID after homepage upload");

  let planConfirmed = false;
  let sawPlanReview = false;
  let validationResponsePromise = null;
  let sandboxValidationCaptured = false;

  for (let i = 0; i < MAX_POLLS; i++) {
    const text = await page.locator("body").innerText();
    const signals = bodySignals(text);
    report.finalStatus = signals.currentStatus;
    report.finalUrl = page.url();

    if (signals.crash) {
      logStage("fatal_ui", signals);
      break;
    }
    if (signals.blank && !signals.loading && !signals.loadError) {
      // Transient blank can happen during API hot reload; retry once before failing.
      await page.waitForTimeout(3000);
      const retryText = await page.locator("body").innerText();
      const retrySignals = bodySignals(retryText);
      if (retrySignals.blank && !retrySignals.loading && !retrySignals.pipeline) {
        logStage("fatal_ui", retrySignals);
        break;
      }
    }
    if (signals.jobNotFound) {
      logStage("job_not_found", signals);
      break;
    }
    if (signals.loadError || signals.failed) {
      logStage("terminal_failure", signals);
      inspectDb(generationId);
      break;
    }

    if ((signals.planReview || signals.preparingPlan || signals.awaitingPlan || signals.planning) && !sawPlanReview) {
      sawPlanReview = true;
      const refreshSignals = await refreshAndCheck(page, "plan_review");
      const snap = await fetchGenerationSnapshot(page, generationId);
      const db = inspectDb(generationId);
      assessOpenAiEvidence(snap, db);
      report.planReview = { visible: refreshSignals.planReview || refreshSignals.preparingPlan, refreshSignals };
    }

    if (signals.planReview && !planConfirmed) {
      const confirm = page.getByRole("button", { name: /confirm generation plan|confirm plan/i });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
        planConfirmed = true;
        logStage("plan_confirmed");
        await page.waitForTimeout(3000);
        await refreshAndCheck(page, "after_plan_confirm");
      }
    }

    if (signals.compiling && !validationResponsePromise) {
      validationResponsePromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes("/api/v1/generations/") &&
            resp.url().includes("/sandbox-validation") &&
            resp.request().method() === "POST",
          { timeout: 180_000 },
        )
        .then(async (resp) => ({
          ok: resp.ok(),
          status: resp.status(),
          body: (await resp.text()).slice(0, 1000),
        }))
        .catch((error) => ({ ok: false, status: 0, body: String(error) }));
      logStage("awaiting_sandbox_validation_post");
    }

    if (validationResponsePromise && !sandboxValidationCaptured) {
      validationResponsePromise.then((result) => {
        if (!sandboxValidationCaptured) {
          sandboxValidationCaptured = true;
          report.sandboxValidation = result;
          logStage("sandbox_validation_post", result);
        }
      });
    }

    if (signals.generating && i % 6 === 0) await refreshAndCheck(page, "generating");
    if (signals.validating && i % 6 === 0) await refreshAndCheck(page, "validating");
    if (signals.compiling && i % 6 === 0) await refreshAndCheck(page, "compiling");

    if (signals.ready && (signals.previewReady || (await page.locator("[data-sandpack-preview-root]").count()) > 0)) {
      const refreshSignals = await refreshAndCheck(page, "ready");
      const snap = await fetchGenerationSnapshot(page, generationId);
      const db = inspectDb(generationId);
      assessOpenAiEvidence(snap, db);
      report.repairAttempts = snap?.repair?.attemptCount ?? snap?.visualCorrectionAttempt ?? 0;
      report.preview = {
        previewReady: refreshSignals.previewReady,
        hasPreviewRoot: await page.locator("[data-sandpack-preview-root]").count(),
        generatedProjectView: refreshSignals.generatedProjectView,
      };
      report.success =
        refreshSignals.currentStatus === "Ready" &&
        !refreshSignals.blank &&
        !refreshSignals.crash &&
        (refreshSignals.previewReady || report.preview.hasPreviewRoot > 0);
      logStage("ready_with_preview", report.preview);
      break;
    }

    if (i % 12 === 0) {
      inspectDb(generationId);
      logStage("poll", { i, status: signals.currentStatus });
    }

    await page.waitForTimeout(POLL_MS);
  }

  report.endedAt = new Date().toISOString();
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log("\n=== E2E REPORT ===");
  console.log(JSON.stringify({
    success: report.success,
    generationId: report.generationId,
    finalStatus: report.finalStatus,
    finalUrl: report.finalUrl,
    preview: report.preview,
    sandboxValidation: report.sandboxValidation,
    compileDurationMs: report.compileDurationMs,
    openAiEvidence: report.openAiEvidence,
    repairAttempts: report.repairAttempts,
    consoleErrors: report.consoleErrors.slice(0, 5),
    pageErrors: report.pageErrors,
    networkFailures: report.networkFailures.slice(0, 10),
  }, null, 2));
  console.log("Full report:", REPORT_PATH);

  await context.close();
  await browser.close();
  if (!report.success) process.exit(1);
}

main().catch((error) => {
  report.fatalError = String(error);
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.error(error);
  process.exit(1);
});
