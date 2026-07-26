import { PrismaClient } from "@prisma/client";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import JSZip from "jszip";
import { SessionService } from "../src/auth/SessionService.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";
import { buildServer } from "../src/server.js";
import { testAuthHeaders } from "../src/test/authHelpers.js";

const generationId = "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const exportId = "75e42c99-fef8-4f43-964c-b9918c28a0ea";

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
  const { app } = await buildServer(env, { enablePersistence: true });
  const prisma = new PrismaClient();

  const ownerId = (
    await prisma.generation.findUniqueOrThrow({ where: { id: generationId }, select: { ownerId: true } })
  ).ownerId;
  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: ownerId, token });
  const cookie = `reactify_session=${token}`;

  const response = await app.inject({
    method: "GET",
    url: `/api/v1/generations/${generationId}/exports/${exportId}/download`,
    headers: testAuthHeaders(cookie),
  });

  const extractDir = await mkdtemp(join(tmpdir(), "reactify-export-verify-"));
  try {
    expectStatus(response.statusCode, 200);
    expectHeader(response.headers["content-type"], "application/zip");
    if (!String(response.headers["content-disposition"]).includes("salesdashboard-v3.zip")) {
      throw new Error(`Unexpected Content-Disposition: ${response.headers["content-disposition"]}`);
    }

    const zip = await JSZip.loadAsync(response.rawPayload);
    const entries = Object.keys(zip.files).filter((entry) => !zip.files[entry]!.dir);
    const packageJsonEntry = entries.find((entry) => entry.endsWith("package.json"));
    if (!packageJsonEntry) {
      throw new Error("package.json missing from export");
    }

    for (const entry of entries) {
      const content = await zip.file(entry)!.async("nodebuffer");
      const target = join(extractDir, entry);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }

    const projectRoot = join(extractDir, entries[0]!.split("/")[0]!);
    execSync("npm install", { cwd: projectRoot, stdio: "pipe" });
    execSync("npm run build", { cwd: projectRoot, stdio: "pipe" });

    console.log(
      JSON.stringify(
        {
          statusCode: response.statusCode,
          contentType: response.headers["content-type"],
          contentDisposition: response.headers["content-disposition"],
          contentLength: response.headers["content-length"],
          byteLength: response.rawPayload.length,
          zipEntryCount: entries.length,
          npmInstall: "ok",
          npmRunBuild: "ok",
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    await prisma.$disconnect();
    await rm(extractDir, { recursive: true, force: true });
  }
}

function expectStatus(actual: number, expected: number) {
  if (actual !== expected) {
    throw new Error(`Expected status ${expected}, received ${actual}`);
  }
}

function expectHeader(actual: string | string[] | undefined, expected: string) {
  if (actual !== expected) {
    throw new Error(`Expected header ${expected}, received ${String(actual)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
