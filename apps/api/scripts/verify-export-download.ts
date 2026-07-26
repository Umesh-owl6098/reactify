/** Download a ready export via authenticated API request. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { SessionService } from "../src/auth/SessionService.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const apiBase = process.argv[3] ?? "http://127.0.0.1:3001";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    include: { exports: { where: { status: "ready" }, orderBy: { createdAt: "desc" }, take: 1 } },
  });

  const ready = row.exports[0];
  if (!ready) {
    throw new Error("No ready export found");
  }

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });

  const response = await fetch(
    `${apiBase}/api/v1/generations/${generationId}/exports/${ready.exportId}/download`,
    {
      headers: { cookie: `reactify_session=${token}` },
    },
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  const outputPath = join(process.cwd(), "storage/recovery", generationId, ready.filename);
  await writeFile(outputPath, buffer);

  console.log(
    JSON.stringify(
      {
        generationId,
        exportId: ready.exportId,
        filename: ready.filename,
        httpStatus: response.status,
        bytes: buffer.byteLength,
        outputPath,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
