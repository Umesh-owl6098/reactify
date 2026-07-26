#!/usr/bin/env node
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DURATION_MS = Number(process.env.STABILITY_DURATION_MS ?? 10 * 60 * 1000);
const REPORT_PATH = join(__dirname, "dev-stability-report.json");

const report = {
  startedAt: new Date().toISOString(),
  durationMs: DURATION_MS,
  checks: [],
  proxyFailures: 0,
  apiFailures: 0,
  workerFailures: 0,
  webFailures: 0,
};

function record(name, ok, detail = {}) {
  report.checks.push({ at: new Date().toISOString(), name, ok, ...detail });
}

async function probe(url) {
  const response = await fetch(url);
  return response.ok;
}

async function main() {
  let stack = null;
  const existingStackHealthy = await probe("http://127.0.0.1:3001/health") && await probe("http://127.0.0.1:5174/");

  if (!existingStackHealthy) {
    stack = spawn("node", ["scripts/dev-stack.mjs"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    stack.stdout.on("data", (chunk) => process.stdout.write(chunk));
    stack.stderr.on("data", (chunk) => process.stderr.write(chunk));
    await new Promise((resolve) => setTimeout(resolve, 15_000));
  } else {
    console.log("[stability] Using already-running dev stack.");
  }

  const endAt = Date.now() + DURATION_MS;
  let touchCount = 0;

  while (Date.now() < endAt) {
    try {
      const apiOk = await probe("http://127.0.0.1:3001/health");
      if (!apiOk) report.apiFailures += 1;
      record("api_health", apiOk);

      const workerOk = await probe("http://127.0.0.1:3001/api/v1/system/readiness");
      if (!workerOk) report.workerFailures += 1;
      record("worker_readiness", workerOk);

      const webOk = await probe("http://127.0.0.1:5174/");
      if (!webOk) report.webFailures += 1;
      record("web_root", webOk);

      try {
        const proxyOk = await probe("http://127.0.0.1:5174/api/v1/system/readiness");
        if (!proxyOk) report.proxyFailures += 1;
        record("vite_proxy_readiness", proxyOk);
      } catch (error) {
        report.proxyFailures += 1;
        record("vite_proxy_readiness", false, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      report.apiFailures += 1;
      record("probe_error", false, { error: error instanceof Error ? error.message : String(error) });
    }

    if (touchCount % 6 === 0) {
      const target = join(ROOT, "apps/web/src/dev-stability-touch.ts");
      writeFileSync(target, `export const STABILITY_TOUCH = ${Date.now()};\n`);
      record("hmr_touch", true, { file: "dev-stability-touch.ts" });
    }
    touchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }

  report.endedAt = new Date().toISOString();
  report.success = report.proxyFailures === 0 && report.apiFailures === 0;
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  if (stack) {
    stack.kill("SIGTERM");
  }
  console.log("\n=== STABILITY REPORT ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("Report written to", REPORT_PATH);
  process.exit(report.success ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
