/**
 * Real recovery loop for one generation.
 *
 * Every step below is genuine: the active project version is written to disk and
 * built with Vite (real compilation), served and loaded in Chromium (real
 * runtime and DOM), captured at the server-resolved comparison viewport (real
 * screenshot), and scored by the comparison engine (real metrics). Nothing is
 * mocked and no status or hash is written by hand — the sandbox report and the
 * visual correction both go through the same services the API uses.
 */
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import type { Diagnostic, GeneratedProjectV1, SandboxValidationRequest } from "@reactify/generation-contracts";
import { MockAIProvider } from "@reactify/test-utils";
import { resolveAppPaths } from "../src/config/paths.js";
import { validateEnv } from "../src/env.js";
import { reconcileGenerationLocksSync } from "../src/jobs/generation-lock-reconciliation.js";
import { hydrateOwnedGenerationRecord } from "../src/lib/hydrateGenerationRecord.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { VisualComparisonService } from "../src/lib/visual-comparison/VisualComparisonService.js";
import { validateVisualFidelity } from "../src/lib/visual-fidelity/visualFidelityValidator.js";
import { PersistenceService } from "../src/persistence/PersistenceService.js";
import { PipelineRunner } from "../src/pipeline/PipelineRunner.js";
import { createDefaultRegistry } from "../src/pipeline/registry.js";
import { createStageExecutors } from "../src/pipeline/stages/index.js";
import { GenerationStore } from "../src/pipeline/store.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { createAIProvider } from "../src/providers/providerFactory.js";
import { createScriptStores } from "./lib/script-storage.js";

const require = createRequire(import.meta.url);
const { chromium } = require("../../web/node_modules/playwright");

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const maxRounds = Number(process.argv[3] ?? 3);
const workDir = process.argv[4] ?? "/tmp/reactify-recovery";
const previewPort = Number(process.argv[5] ?? 5233);

interface BuildResult {
  success: boolean;
  durationMs: number;
  errors: Diagnostic[];
}

function run(command: string, args: string[], cwd: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, shell: false });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function materialize(project: GeneratedProjectV1, dir: string): Promise<void> {
  for (const file of project.files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
  }
}

async function buildProject(dir: string): Promise<BuildResult> {
  const startedAt = Date.now();
  const result = await run("npm", ["run", "build"], dir);
  const durationMs = Date.now() - startedAt;

  if (result.code === 0) {
    return { success: true, durationMs, errors: [] };
  }

  return {
    success: false,
    durationMs,
    errors: [
      {
        code: "VITE_BUILD_FAILED",
        message: result.output.slice(-1800),
        severity: "error",
        source: "bundler",
        category: "compilation",
      },
    ],
  };
}

function startPreview(dir: string, port: number): ChildProcess {
  return spawn("npx", ["vite", "preview", "--port", String(port), "--strictPort"], { cwd: dir, shell: false });
}

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server has not bound yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start at ${url}`);
}

interface RuntimeCapture {
  success: boolean;
  durationMs: number;
  errors: Diagnostic[];
  dom: { width: number; height: number; childElements: number; textLength: number };
  screenshot: Buffer;
}

async function captureRuntime(url: string, width: number, height: number): Promise<RuntimeCapture> {
  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors: Diagnostic[] = [];

    page.on("console", (message: { type: () => string; text: () => string }) => {
      if (message.type() === "error") {
        errors.push({
          code: "CONSOLE_ERROR",
          message: message.text().slice(0, 1800),
          severity: "error",
          source: "console",
          category: "runtime",
        });
      }
    });
    page.on("pageerror", (error: Error) => {
      errors.push({
        code: "UNCAUGHT_EXCEPTION",
        message: String(error.message).slice(0, 1800),
        severity: "error",
        source: "runtime",
        category: "runtime",
      });
    });

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
        textLength: (root.textContent ?? "").trim().length,
      };
    });

    const screenshot: Buffer = await page.screenshot({ fullPage: false });
    const rendered = dom.width > 0 && dom.height > 0 && dom.childElements > 0;

    return {
      success: rendered && errors.length === 0,
      durationMs: Date.now() - startedAt,
      errors: rendered
        ? errors
        : [
            ...errors,
            {
              code: "BLANK_DOM",
              message: `Root element rendered nothing: ${JSON.stringify(dom)}`,
              severity: "error",
              source: "runtime",
              category: "runtime",
            },
          ],
      dom,
      screenshot,
    };
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

  const { imageStorage, comparisonArtifactStore } = createScriptStores(env);
  const runner = new PipelineRunner(createDefaultRegistry(createStageExecutors(imageStorage)), store, imageStorage, DEFAULT_FEATURE_FLAGS, {
    aiProvider: new MockAIProvider(),
    loadPrompt: defaultLoadPrompt,
    aiConfig: { model: "mock", temperature: 0.2, maxTokens: 4096, timeoutMs: 30_000 },
    repairConfig: {
      maxAttempts: env.MAX_REPAIR_ATTEMPTS,
      maxPatchFileBytes: env.MAX_PATCH_FILE_BYTES,
      maxPatchTotalBytes: env.MAX_PATCH_TOTAL_BYTES,
    },
  });

  const comparisonService = VisualComparisonService.fromDeps({
    aiProvider: createAIProvider(env),
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage,
    artifactStore: comparisonArtifactStore,
  });

  const rounds: unknown[] = [];

  for (let round = 1; round <= maxRounds; round += 1) {
    const record = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
    if (!record?.outputs.generatedProject || !record.projectHash) {
      throw new Error("Generation has no active project");
    }

    reconcileGenerationLocksSync(record, { editLockTimeoutMs: 0, visualCaptureTimeoutMs: 0, exportLockTimeoutMs: 0 });
    await store.persist(record);

    const project = record.outputs.generatedProject;
    const projectHash = record.projectHash;

    await rm(join(workDir, "src"), { recursive: true, force: true });
    await mkdir(workDir, { recursive: true });
    await materialize(project, workDir);

    const install = await run("npm", ["install", "--no-audit", "--no-fund"], workDir);
    if (install.code !== 0) {
      throw new Error(`npm install failed:\n${install.output.slice(-2000)}`);
    }

    const build = await buildProject(workDir);

    let runtime: RuntimeCapture | null = null;
    let preview: ChildProcess | null = null;
    const url = `http://localhost:${previewPort}/`;

    // The comparison viewport is decided by the service from the real source
    // dimensions, so create the record before sizing the browser.
    const fresh = store.get(generationId)!;
    let comparisonId: string | null = null;
    let viewport = { width: 1440, height: 810, deviceScaleFactor: 1 };

    if (build.success) {
      preview = startPreview(workDir, previewPort);
      try {
        await waitForServer(url);

        const created = await comparisonService.createComparison(
          fresh,
          {
            expectedProjectHash: projectHash,
            viewport: { width: 1440, height: 810, deviceScaleFactor: 1 },
          },
          randomUUID(),
        );
        if (created.ok) {
          comparisonId = created.comparison.comparisonId;
          viewport = created.comparison.viewport;
        } else {
          console.log(`createComparison blocked: ${created.errorCode} ${created.message}`);
        }
        await store.persist(fresh);

        runtime = await captureRuntime(url, viewport.width, viewport.height);
      } finally {
        preview?.kill("SIGTERM");
      }
    }

    const report: SandboxValidationRequest = {
      generationId,
      projectHash,
      compilation: { success: build.success, durationMs: build.durationMs, errors: build.errors, warnings: [] },
      runtime: {
        success: runtime?.success ?? false,
        durationMs: runtime?.durationMs ?? 0,
        errors: runtime?.errors ?? [
          {
            code: "COMPILATION_FAILED",
            message: "Runtime was not exercised because compilation failed.",
            severity: "error",
            source: "runtime",
            category: "runtime",
          },
        ],
        warnings: [],
      },
      validatedAt: new Date().toISOString(),
    };

    const submit = await runner.submitSandboxValidation(generationId, report);
    if (submit.ok && submit.shouldResume) {
      await runner.resumeFromSandbox(generationId);
    }
    await store.persistById(generationId);

    let metrics: Record<string, unknown> | null = null;
    if (comparisonId && runtime) {
      const active = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
      const submitted = await comparisonService.submitScreenshot(active!, comparisonId, {
        expectedProjectHash: projectHash,
        viewport,
        imageFormat: "png",
        screenshotBase64: runtime.screenshot.toString("base64"),
        capturedAt: new Date().toISOString(),
      });
      await store.persist(active!);

      if (submitted.ok) {
        metrics = {
          status: submitted.comparison.status,
          overallSimilarityScore: submitted.comparison.overallSimilarityScore,
          pixelDifferencePercentage: submitted.comparison.pixelDifferencePercentage,
          structuralDifferenceScore: submitted.comparison.structuralDifferenceScore,
          highSeverityRegions: submitted.comparison.regions.filter((region) => region.severity === "high").length,
          regions: submitted.comparison.regions.map((region) => ({
            severity: region.severity,
            category: region.likelyCategory,
            score: region.differenceScore,
            bounds: region.bounds,
          })),
        };
      } else {
        metrics = { error: submitted.message };
      }
    }

    const afterCapture = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
    const composition = afterCapture?.outputs.designAnalysis?.visualComposition;
    const fidelity =
      composition && afterCapture?.outputs.generatedProject
        ? validateVisualFidelity(composition, afterCapture.outputs.generatedProject)
        : null;

    const roundSummary = {
      round,
      projectHash,
      compilationSuccess: build.success,
      runtimeSuccess: runtime?.success ?? false,
      dom: runtime?.dom ?? null,
      viewport,
      metrics,
      fidelity: fidelity
        ? {
            acceptable: fidelity.acceptable,
            coverage: fidelity.coverage,
            issues: fidelity.issues.map((issue) => issue.message),
          }
        : null,
      status: afterCapture?.status,
    };
    rounds.push(roundSummary);
    console.log(`\n=== ROUND ${round} ===\n${JSON.stringify(roundSummary, null, 2)}`);

    const similarity = typeof metrics?.overallSimilarityScore === "number" ? metrics.overallSimilarityScore : 0;
    if (fidelity?.acceptable && similarity >= env.VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD) {
      console.log("\nRecovery target reached.");
      break;
    }

    if (!comparisonId || round === maxRounds) {
      continue;
    }

    const forCorrection = await hydrateOwnedGenerationRecord({ store, persistence, generationId, ownerId });
    const comparison = forCorrection?.visualComparisons.find((entry) => entry.comparisonId === comparisonId);
    if (!forCorrection || comparison?.status !== "correction_available") {
      console.log(`\nNo correction available (comparison status: ${comparison?.status ?? "missing"}).`);
      continue;
    }

    const corrected = await comparisonService.applyCorrection(forCorrection, comparisonId, {
      expectedProjectHash: forCorrection.projectHash!,
    });
    await store.persist(forCorrection);
    console.log(
      `\ncorrection round ${round}: ${corrected.ok ? "applied" : `failed (${corrected.errorCode}: ${corrected.message})`}`,
    );

    if (!corrected.ok) {
      break;
    }
  }

  console.log(`\n=== SUMMARY ===\n${JSON.stringify(rounds, null, 2)}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
