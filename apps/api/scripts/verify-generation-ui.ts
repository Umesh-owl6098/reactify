/**
 * Verify preview, export download, and compare eligibility for a generation.
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { PrismaClient } from "@prisma/client";
import { SessionService } from "../src/auth/SessionService.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";

const require = createRequire(import.meta.url);
const { chromium } = require(join(dirname(fileURLToPath(import.meta.url)), "../../web/node_modules/playwright"));

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const webBaseUrl = process.argv[3] ?? "http://localhost:5174";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true, latestProjectHash: true, status: true },
  });

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    {
      name: "reactify_session",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${webBaseUrl}/generations/${generationId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-sandpack-preview-root], [class*='sp-']", { timeout: 90000 }).catch(() => undefined);
  await page.waitForTimeout(5000);

  const statusResponse = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    return res.json();
  }, generationId);

  const iframeVisible = await page.evaluate(() => {
    const iframe = document.querySelector<HTMLIFrameElement>("[data-sandpack-preview-root] iframe");
    return Boolean(iframe && iframe.clientWidth > 0 && iframe.clientHeight > 0);
  });

  const exportDownloadDir = await mkdtemp(join(tmpdir(), "reactify-export-verify-"));
  const download = await page.waitForEvent("download", { timeout: 15000 }).catch(() => null);
  const exportButton = page.getByRole("button", { name: /Download again/i }).first();
  if (await exportButton.isVisible().catch(() => false)) {
    await exportButton.click();
  }

  let exportPath: string | null = null;
  const capturedDownload = download ?? (await page.waitForEvent("download", { timeout: 10000 }).catch(() => null));
  if (capturedDownload) {
    exportPath = join(exportDownloadDir, await capturedDownload.suggestedFilename());
    await capturedDownload.saveAs(exportPath);
  }

  const compareButton = page.getByRole("button", { name: "Compare with Original" });
  const compareEnabled = await compareButton.isEnabled().catch(() => false);

  console.log(
    JSON.stringify(
      {
        generationId,
        pageUrl: `${webBaseUrl}/generations/${generationId}`,
        apiStatus: {
          status: statusResponse.status,
          exportAllowed: statusResponse.exportAllowed,
          editAllowed: statusResponse.editAllowed,
          visualComparisonAllowed: statusResponse.visualComparisonAllowed,
          sandboxValidation: statusResponse.sandboxValidation
            ? {
                compilationSuccess: statusResponse.sandboxValidation.compilation.success,
                runtimeSuccess: statusResponse.sandboxValidation.runtime.success,
                projectHash: statusResponse.sandboxValidation.projectHash,
              }
            : null,
        },
        preview: {
          iframeVisible,
          sandpackRootPresent: await page.locator("[data-sandpack-preview-root]").count(),
        },
        export: {
          downloadSaved: exportPath,
          downloadBytes: exportPath ? (await readFile(exportPath)).byteLength : 0,
        },
        compare: {
          buttonEnabled: compareEnabled,
        },
        consoleErrors: consoleErrors.filter((entry) => !entry.includes("col.csbops.io")),
        telemetryErrors: consoleErrors.filter((entry) => entry.includes("col.csbops.io") || entry.includes("csbops")),
      },
      null,
      2,
    ),
  );

  await browser.close();
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
