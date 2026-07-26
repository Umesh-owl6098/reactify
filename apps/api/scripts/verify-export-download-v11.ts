/** Verify export download via API without starting an edit. */
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";
import { SessionService } from "../src/auth/SessionService.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";
import { testAuthHeaders } from "../src/test/authHelpers.js";

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
  const { app } = await buildServer(env, { enablePersistence: true });
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true, latestProjectHash: true, activeVersionId: true },
  });

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });
  const cookie = `reactify_session=${token}`;

  const exportResponse = await app.inject({
    method: "POST",
    url: `/api/v1/generations/${generationId}/exports`,
    headers: testAuthHeaders(cookie),
    payload: {
      projectName: "salesdashboard",
      includeMetadata: true,
      includeGenerationSummary: false,
    },
  });

  if (![200, 202].includes(exportResponse.statusCode)) {
    throw new Error(`Export failed: ${exportResponse.body}`);
  }

  const body = exportResponse.json() as { exportId: string; filename?: string; status?: string };
  const exportId = body.exportId;
  let filename = body.filename ?? null;

  for (let attempt = 0; attempt < 30; attempt++) {
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}/exports/${exportId}`,
      headers: testAuthHeaders(cookie),
    });
    const statusBody = statusResponse.json() as { status: string; filename?: string };
    filename = statusBody.filename ?? filename;
    if (statusBody.status === "ready") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const downloadResponse = await app.inject({
    method: "GET",
    url: `/api/v1/generations/${generationId}/exports/${exportId}/download`,
    headers: testAuthHeaders(cookie),
  });

  if (downloadResponse.statusCode !== 200) {
    throw new Error(`Download failed: ${downloadResponse.body}`);
  }

  const extractDir = await mkdtemp(join(tmpdir(), "reactify-export-verify-"));
  try {
    const zip = await JSZip.loadAsync(downloadResponse.rawPayload);
    const entries = Object.keys(zip.files).filter((entry) => !zip.files[entry]!.dir);
    for (const entry of entries) {
      const content = await zip.file(entry)!.async("nodebuffer");
      const target = join(extractDir, entry);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    const projectRoot = join(extractDir, entries[0]!.split("/")[0]!);
    execSync("npm install", { cwd: projectRoot, stdio: "pipe" });
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    const hasNewSubscriptions = entries.some((entry) => entry.endsWith("BottomChartsContainer.tsx"));
    let titleOk = false;
    if (hasNewSubscriptions) {
      const content = await zip.file(entries.find((e) => e.endsWith("BottomChartsContainer.tsx"))!)!.async("string");
      titleOk = content.includes("New Subscriptions");
    }

    console.log(
      JSON.stringify(
        {
          generationId,
          activeVersionId: row.activeVersionId,
          exportHttp: exportResponse.statusCode,
          downloadHttp: downloadResponse.statusCode,
          filename,
          zipEntryCount: entries.length,
          buildPassed: true,
          hasNewSubscriptionsTitle: titleOk,
        },
        null,
        2,
      ),
    );
  } finally {
    await rm(extractDir, { recursive: true, force: true });
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
