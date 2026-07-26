/**
 * Mints a real session for the generation's existing owner.
 *
 * The end-to-end suite needs an authenticated browser, but it must not change
 * the owner's credentials to get one. SessionService is the same component the
 * sign-in route uses, so the resulting cookie is an ordinary session — it is
 * just issued directly instead of in exchange for a password.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { SessionService } from "../src/auth/SessionService.js";
import { validateEnv } from "../src/env.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";

const generationId = process.argv[2] ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const webHost = process.argv[3] ?? "localhost";
const outputPath = join(process.cwd(), "..", "web", "e2e", ".auth", "state.json");

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();

  const { ownerId } = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: { ownerId: true },
  });

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: ownerId, token });

  const state = {
    cookies: [
      {
        name: env.SESSION_COOKIE_NAME,
        value: token,
        domain: webHost,
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(state, null, 2), { mode: 0o600 });

  console.log(JSON.stringify({ generationId, ownerId, cookieName: env.SESSION_COOKIE_NAME, outputPath }, null, 2));
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
