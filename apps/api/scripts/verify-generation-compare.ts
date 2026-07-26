/** POST visual-comparison when generation is Ready (integrity gate only). */
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
  const storageDir = await mkdtemp(join(tmpdir(), "reactify-verify-compare-"));
  const { app } = await buildServer(env, { storageDir, enablePersistence: true });
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUnique({
    where: { id: generationId },
    select: { ownerId: true, latestProjectHash: true, status: true },
  });
  if (!row?.latestProjectHash) {
    throw new Error("Generation not found");
  }

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });
  const cookie = `reactify_session=${token}`;

  try {
    const compareResponse = await app.inject({
      method: "POST",
      url: `/api/v1/generations/${generationId}/visual-comparisons`,
      headers: testAuthHeaders(cookie),
      payload: {
        expectedProjectHash: row.latestProjectHash,
        viewport: { width: 1280, height: 720 },
      },
    });

    console.log(
      JSON.stringify(
        {
          generationId,
          status: row.status,
          expectedProjectHash: row.latestProjectHash,
          compare: { http: compareResponse.statusCode, body: compareResponse.json() },
        },
        null,
        2,
      ),
    );

    if (![200, 202].includes(compareResponse.statusCode)) {
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
