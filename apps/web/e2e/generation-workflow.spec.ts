import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_DIR, REPO_ROOT } from "./paths.js";

const run = promisify(execFile);

const API_BASE_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
const GENERATION_ID = process.env.E2E_GENERATION_ID ?? "a1178bcb-8c58-4f0a-8884-d50082445368";

/** Nothing in this suite is mocked, so a full pass takes several minutes. */
test.describe.configure({ mode: "serial", timeout: 10 * 60 * 1000 });

interface GenerationStatus {
  status: string;
  projectHash: string | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  exportAllowed: boolean;
  editAllowed: boolean;
  visualComparisonAllowed: boolean;
  latestExportSummary: { exportId: string; status: string; filename: string } | null;
  latestSimilarityScore: number | null;
  outputs: { generatedProject: unknown };
}

async function fetchStatus(request: APIRequestContext): Promise<GenerationStatus> {
  const response = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}`);
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as GenerationStatus;
}

async function apiScript(script: string, args: string[] = []): Promise<string> {
  const { stdout } = await run("npx", ["tsx", join("scripts", script), GENERATION_ID, ...args], {
    cwd: API_DIR,
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

/**
 * The recovery scripts interleave progress logs with pretty-printed JSON, so
 * take the last top-level value rather than trying to match braces anywhere.
 */
function lastJsonValue<T>(output: string): T {
  // Pretty-printed top-level values start and end in column zero, which
  // distinguishes them from the nested objects inside them.
  const lines = output.split("\n");
  for (let start = lines.length - 1; start >= 0; start -= 1) {
    const opener = lines[start]!;
    if (opener !== "{" && opener !== "[") {
      continue;
    }
    const closer = opener === "{" ? "}" : "]";
    for (let end = lines.length - 1; end > start; end -= 1) {
      if (lines[end] !== closer) {
        continue;
      }
      try {
        return JSON.parse(lines.slice(start, end + 1).join("\n")) as T;
      } catch {
        // Not the boundary of a complete value; keep scanning.
      }
    }
  }
  throw new Error(`no JSON value in script output:\n${output.slice(-3000)}`);
}

async function openGeneration(page: Page): Promise<string[]> {
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));

  await page.goto(`/generations/${GENERATION_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Generated source code" })).toBeVisible({ timeout: 60_000 });

  return consoleMessages;
}

/**
 * A previous run (or an interrupted one) can leave the generation mid-flight.
 * Settle it through the real validation path so the suite starts from the same
 * place whether or not the stack was just restarted.
 */
test.beforeAll(async ({ request }) => {
  const settled = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}`);
  if (settled.status() !== 200) {
    return;
  }

  const status = (await settled.json()) as GenerationStatus;
  if (status.status === "Ready") {
    return;
  }

  await apiScript("recover-generation-loop.ts", ["1", "/tmp/reactify-e2e-settle", "5247"]);
});

test("the generation opens, reports honest availability, and never selects an unsupported preset", async ({
  page,
  request,
}) => {
  const consoleMessages = await openGeneration(page);

  const status = await fetchStatus(request);
  expect(status.status).toBe("Ready");
  expect(status.projectHash).toBeTruthy();
  expect(status.outputs.generatedProject).toBeTruthy();

  // Part 8: each capability states its own availability rather than sharing one flag.
  const availability = page.getByLabel("Feature availability");
  await expect(availability).toBeVisible();
  await expect(availability.getByText(/^Export:$/)).toBeVisible();
  await expect(availability.getByText(/^Compare with original:$/)).toBeVisible();
  await expect(availability.getByText(/^Edit:$/)).toBeVisible();

  await page.waitForTimeout(5_000);
  const unsupportedPreset = consoleMessages.filter((message) => /unknown preset/i.test(message));
  expect(unsupportedPreset, `unsupported Sandpack preset warning: ${unsupportedPreset.join(" | ")}`).toHaveLength(0);

  // Part 1/2: telemetry failures must not be treated as a preview failure.
  const telemetryFailures = consoleMessages.filter((message) => message.includes("csbops.io"));
  const status2 = await fetchStatus(request);
  expect(status2.status, `telemetry noise changed the status: ${telemetryFailures.join(" | ")}`).toBe("Ready");
});

test("edit history contains no records from another generation", async ({ request }) => {
  const response = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/edits`);
  expect(response.status()).toBe(200);

  const body = (await response.json()) as { edits: Array<{ generationId: string; instruction: string }> };
  for (const edit of body.edits) {
    expect(edit.generationId).toBe(GENERATION_ID);
  }
});

test("a real comparison completes with real metrics at the source aspect ratio", async ({ request }) => {
  const output = await apiScript("recover-generation-loop.ts", ["1", "/tmp/reactify-e2e-preview", "5244"]);
  const rounds = lastJsonValue<Array<Record<string, unknown>>>(output);
  expect(rounds.length, `recovery loop produced no rounds:\n${output.slice(-3000)}`).toBeGreaterThan(0);
  const round = rounds[rounds.length - 1]!;

  const metrics = round.metrics as Record<string, number> | null;
  expect(metrics, `comparison produced no metrics:\n${output.slice(-3000)}`).toBeTruthy();

  // Part 4: the source is 2000x1111, so a 1440 wide capture must be 800 tall.
  const viewport = round.viewport as { width: number; height: number };
  expect(viewport.width).toBe(1440);
  expect(viewport.height).toBe(800);

  // Part 4: never fake 0/0 for a capture that really happened.
  expect(metrics!.overallSimilarityScore).toBeGreaterThan(0);
  expect(metrics!.pixelDifferencePercentage).toBeGreaterThan(0);

  // Part 7: the rendered result has to actually resemble the uploaded source.
  expect(metrics!.overallSimilarityScore).toBeGreaterThanOrEqual(75);
  expect(metrics!.highSeverityRegions).toBe(0);
  expect(round.compilationSuccess).toBe(true);
  expect(round.runtimeSuccess).toBe(true);

  const dom = round.dom as { width: number; height: number; childElements: number };
  expect(dom.childElements).toBeGreaterThan(0);
  expect(dom.width).toBeGreaterThan(0);
  expect(dom.height).toBeGreaterThan(0);

  const status = await fetchStatus(request);
  expect(status.status).toBe("Ready");
});

test("no comparison is stranded and the major source objects are represented", async () => {
  const output = await apiScript("check-visual-fidelity.ts");
  const snapshot = lastJsonValue<{
    comparisons: Array<{ comparisonId: string; status: string }>;
    hasComposition: boolean;
    report: { acceptable: boolean; coverage: number; issues: Array<{ severity: string; message: string }> } | null;
  }>(output);

  // Part 4: capture is either finished or terminally failed, never left hanging.
  const stranded = snapshot.comparisons.filter((entry) => entry.status === "awaiting_capture");
  expect(stranded, `stranded comparisons: ${JSON.stringify(stranded)}`).toHaveLength(0);

  // Part 7: structural fidelity is measured against the analysed composition.
  expect(snapshot.hasComposition, "the generation has no structured visual composition").toBe(true);
  expect(snapshot.report).toBeTruthy();

  const highSeverity = snapshot.report!.issues.filter((issue) => issue.severity === "high");
  expect(highSeverity, `high-severity structural mismatches: ${JSON.stringify(highSeverity)}`).toHaveLength(0);
  expect(snapshot.report!.coverage).toBeGreaterThanOrEqual(1);
});

interface EditSummary {
  editId: string;
  status: string;
  projectHashBefore: string;
  projectHashAfter?: string;
  createdVersionId?: string;
  versionNumber?: number;
  failureReason?: string;
  clarificationQuestion?: string;
}

async function fetchEdit(request: APIRequestContext, editId: string): Promise<EditSummary> {
  const response = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/edits/${editId}`);
  expect(response.status(), await response.text()).toBe(200);
  return ((await response.json()) as { edit: EditSummary }).edit;
}

const EDIT_TERMINAL = new Set(["completed", "failed", "cancelled", "clarification_required"]);

test("a real edit creates an immutable new version and the generation returns to Ready", async ({ request }) => {
  const before = await fetchStatus(request);
  expect(before.status).toBe("Ready");
  expect(before.editAllowed, "edit was blocked before the run started").toBe(true);

  const created = await request.post(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/edits`, {
    headers: { "idempotency-key": `e2e-edit-${before.projectHash}-${Date.now()}` },
    data: {
      instruction: "Increase the corner radius of the desktop monitor bezel slightly.",
      expectedProjectHash: before.projectHash,
    },
  });
  expect([201, 202], await created.text()).toContain(created.status());
  const body = (await created.json()) as { edit?: EditSummary; editId?: string };
  const editId = body.edit?.editId ?? body.editId!;
  expect(editId).toBeTruthy();

  // The worker drives the edit through intent analysis, patching, and sandbox
  // revalidation; poll the real record rather than assuming a duration.
  let edit = await fetchEdit(request, editId);
  await expect
    .poll(
      async () => {
        edit = await fetchEdit(request, editId);
        if (edit.status === "awaiting_confirmation") {
          await request.post(
            `${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/edits/${editId}/confirm`,
            { data: { expectedProjectHash: edit.projectHashBefore, confirmed: true } },
          );
        }
        return EDIT_TERMINAL.has(edit.status) || edit.status === "awaiting_sandbox_validation";
      },
      { timeout: 6 * 60 * 1000, intervals: [2000] },
    )
    .toBe(true);

  expect(
    edit.status,
    `edit did not apply: ${edit.failureReason ?? edit.clarificationQuestion ?? "no reason given"}`,
  ).not.toBe("failed");

  if (edit.status === "cancelled" || edit.status === "clarification_required") {
    // Part 6: a non-applying edit must still leave every lock clear.
    const unchanged = await fetchStatus(request);
    expect(unchanged.status).toBe("Ready");
    expect(unchanged.editAllowed).toBe(true);
    expect(unchanged.exportAllowed).toBe(true);
    test.skip(true, `model asked for clarification instead of editing: ${edit.clarificationQuestion ?? ""}`);
    return;
  }

  if (edit.status === "awaiting_sandbox_validation") {
    // Part 6/8: Ready requires a real Sandpack compile and runtime pass.
    let recovered = false;
    for (let attempt = 1; attempt <= 2 && !recovered; attempt += 1) {
      const output = await apiScript("recover-generation-loop.ts", [
        "1",
        "/tmp/reactify-e2e-edit",
        String(5245 + attempt),
      ]);
      const rounds = lastJsonValue<Array<Record<string, unknown>>>(output);
      recovered = Boolean(rounds.at(-1)?.metrics);
    }
    expect(recovered, "post-edit comparison and validation did not complete").toBe(true);
    edit = await fetchEdit(request, editId);
  }

  expect(edit.status).toBe("completed");
  expect(edit.createdVersionId, "edit did not create a new version").toBeTruthy();
  expect(edit.projectHashAfter).toBeTruthy();
  expect(edit.projectHashAfter).not.toBe(edit.projectHashBefore);

  const after = await fetchStatus(request);
  expect(after.status).toBe("Ready");
  expect(after.projectHash).toBe(edit.projectHashAfter);
  expect(after.activeVersionId).toBe(edit.createdVersionId);
  expect(after.activeVersionNumber).toBeGreaterThan(before.activeVersionNumber ?? 0);
  expect(after.editAllowed, "edit lock was left behind").toBe(true);
  expect(after.exportAllowed).toBe(true);
  expect(after.visualComparisonAllowed).toBe(true);

  // Part 6: the previous version stays immutable and retrievable.
  const versions = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/versions`);
  expect(versions.status()).toBe(200);
  const versionBody = (await versions.json()) as { versions: Array<{ versionId: string; projectHash: string }> };
  expect(versionBody.versions.some((entry) => entry.projectHash === edit.projectHashBefore)).toBe(true);
  expect(versionBody.versions.some((entry) => entry.versionId === edit.createdVersionId)).toBe(true);
});

interface ExportSummary {
  exportId: string;
  status: string;
  filename: string;
  fileCount: number;
  projectHash: string;
}

test("the current version exports, downloads, extracts, installs, builds, and renders standalone", async ({
  page,
  request,
}) => {
  const status = await fetchStatus(request);
  expect(status.exportAllowed, "export was blocked by a stale record").toBe(true);

  // Part 5: repeating the request with the same key must not create a second job.
  const idempotencyKey = `e2e-export-${status.projectHash}`;
  const requestExport = () =>
    request.post(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/exports`, {
      headers: { "idempotency-key": idempotencyKey },
      data: { projectName: "deviceframesshowcase", includeMetadata: true, includeGenerationSummary: true },
    });

  const first = await requestExport();
  expect([200, 201, 202], await first.text()).toContain(first.status());
  const second = await requestExport();
  expect([200, 201, 202]).toContain(second.status());

  const readSummary = async (response: Awaited<ReturnType<typeof requestExport>>): Promise<ExportSummary> => {
    const parsed = (await response.json()) as ExportSummary | { export: ExportSummary };
    return "export" in parsed ? parsed.export : parsed;
  };
  const exportId = (await readSummary(first)).exportId;
  expect((await readSummary(second)).exportId, "a repeated click created a duplicate export").toBe(exportId);

  let summary!: ExportSummary;
  await expect
    .poll(
      async () => {
        const detail = await request.get(
          `${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/exports/${exportId}`,
        );
        const parsed = (await detail.json()) as ExportSummary | { export: ExportSummary };
        summary = "export" in parsed ? parsed.export : parsed;
        return summary.status;
      },
      { timeout: 3 * 60 * 1000, intervals: [1000] },
    )
    .toBe("ready");

  // Part 5: a ready export always holds real files.
  expect(summary.fileCount).toBeGreaterThan(0);
  expect(summary.projectHash).toBe(status.projectHash);

  const download = await request.get(
    `${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/exports/${exportId}/download`,
  );

  // Part 5: correct status, type, filename, and a non-zero length.
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("application/zip");
  expect(download.headers()["content-disposition"]).toContain(summary.filename);
  expect(Number(download.headers()["content-length"])).toBeGreaterThan(0);

  const archive = await download.body();
  expect(archive.byteLength).toBeGreaterThan(0);

  const workDir = await mkdtemp(join(tmpdir(), "reactify-e2e-export-"));
  try {
    const archivePath = join(workDir, "export.zip");
    await writeFile(archivePath, archive);
    await run("unzip", ["-q", archivePath, "-d", workDir]);

    const projectDir = join(workDir, summary.filename.replace(/-v\d+\.zip$/, ""));
    expect((await stat(join(projectDir, "package.json"))).size).toBeGreaterThan(0);

    await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: projectDir, maxBuffer: 32 * 1024 * 1024 });
    await run("npm", ["run", "build"], { cwd: projectDir, maxBuffer: 32 * 1024 * 1024 });

    const indexHtml = await readFile(join(projectDir, "dist", "index.html"), "utf8");
    expect(indexHtml).toContain("<div id=\"root\">");

    const preview = spawn("npx", ["vite", "preview", "--port", "5245", "--strictPort"], {
      cwd: projectDir,
    });
    try {
      await expect
        .poll(
          async () => {
            try {
              const probe = await request.get("http://localhost:5245/");
              return probe.status();
            } catch {
              return 0;
            }
          },
          { timeout: 60_000 },
        )
        .toBe(200);

      await page.goto("http://localhost:5245/", { waitUntil: "networkidle" });
      const rendered = await page.evaluate(() => {
        const root = document.getElementById("root");
        const rect = root?.getBoundingClientRect();
        return {
          childElements: root?.querySelectorAll("*").length ?? 0,
          width: Math.round(rect?.width ?? 0),
          height: Math.round(rect?.height ?? 0),
        };
      });

      expect(rendered.childElements).toBeGreaterThan(0);
      expect(rendered.width).toBeGreaterThan(0);
      expect(rendered.height).toBeGreaterThan(0);
    } finally {
      preview.kill("SIGTERM");
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

test("a failed export does not block editing, comparing, or a new export", async ({ request }) => {
  const status = await fetchStatus(request);

  const history = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/exports`);
  expect(history.status()).toBe(200);
  const body = (await history.json()) as { exports: Array<{ status: string; fileCount: number }> };

  // Zero-file records may exist in history but must never be downloadable.
  for (const entry of body.exports) {
    if (entry.fileCount === 0) {
      expect(entry.status).not.toBe("ready");
    }
  }

  expect(status.exportAllowed).toBe(true);
  expect(status.editAllowed).toBe(true);
  expect(status.visualComparisonAllowed).toBe(true);
});

test("state survives an API restart and the export downloads again", async ({ request }) => {
  const before = await fetchStatus(request);
  expect(before.status).toBe("Ready");

  await run("bash", ["-lc", "pkill -f 'tsx watch src/index.ts' || true"], { cwd: REPO_ROOT });

  await expect
    .poll(
      async () => {
        try {
          const probe = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}`);
          return probe.status();
        } catch {
          return 0;
        }
      },
      { timeout: 120_000, intervals: [1000] },
    )
    .toBe(200);

  const after = await fetchStatus(request);
  expect(after.status).toBe(before.status);
  expect(after.projectHash).toBe(before.projectHash);
  expect(after.activeVersionNumber).toBe(before.activeVersionNumber);
  expect(after.latestExportSummary?.exportId).toBe(before.latestExportSummary?.exportId);

  const download = await request.get(
    `${API_BASE_URL}/api/v1/generations/${GENERATION_ID}/exports/${after.latestExportSummary!.exportId}/download`,
  );
  expect(download.status()).toBe(200);
  expect((await download.body()).byteLength).toBeGreaterThan(0);
});
