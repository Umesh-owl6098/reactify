/**
 * Verify export, edit, and compare endpoints accept the recovered generation.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const storageDir = await mkdtemp(join(tmpdir(), "reactify-verify-actions-"));
  const { app } = await buildServer(env, { storageDir, enablePersistence: true });
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { ownerId: true, latestProjectHash: true },
  });
  if (!row?.latestProjectHash) {
    throw new Error("Generation not found or missing project hash");
  }

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });
  const cookie = `reactify_session=${token}`;

  try {
    const statusResponse = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
      headers: testAuthHeaders(cookie),
    });
    const status = statusResponse.json() as Record<string, unknown>;
    if (statusResponse.statusCode !== 200) {
      throw new Error(`GET status failed: ${statusResponse.body}`);
    }

    const editResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/edits`,
      headers: {
        ...testAuthHeaders(cookie),
        "idempotency-key": randomUUID(),
      },
      payload: {
        instruction: "Change the dashboard title text color to blue.",
        expectedProjectHash: row.latestProjectHash,
      },
    });

    const compareResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/visual-comparisons`,
      headers: testAuthHeaders(cookie),
      payload: {
        expectedProjectHash: row.latestProjectHash,
        viewport: { width: 1280, height: 720 },
      },
    });

    const exportResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/exports`,
      headers: testAuthHeaders(cookie),
      payload: {
        projectName: "SuspensionBridgeLandscape",
        includeMetadata: true,
        includeGenerationSummary: false,
      },
    });

    console.log(
      JSON.stringify(
        {
          generationId,
          status: {
            http: statusResponse.statusCode,
            exportAllowed: status.exportAllowed,
            editAllowed: status.editAllowed,
            visualComparisonAllowed: status.visualComparisonAllowed,
            activeVersionNumber: status.activeVersionNumber,
            projectHash: status.projectHash,
          },
          export: { http: exportResponse.statusCode, body: exportResponse.json() },
          edit: { http: editResponse.statusCode, body: editResponse.json() },
          compare: { http: compareResponse.statusCode, body: compareResponse.json() },
        },
        null,
        2,
      ),
    );

    const ok =
      status.exportAllowed === true &&
      status.editAllowed === true &&
      status.visualComparisonAllowed === true &&
      [200, 202].includes(exportResponse.statusCode) &&
      [200, 202].includes(editResponse.statusCode) &&
      [200, 202].includes(compareResponse.statusCode);

    if (!ok) {
      process.exit(1);
    }
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
