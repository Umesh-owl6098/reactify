/**
 * Open the Reactify workspace with an authenticated session cookie and wait for
 * genuine Sandpack compilation/runtime validation to POST sandbox-validation.
 */
import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { SessionService } from "../src/auth/SessionService.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";

const require = createRequire(import.meta.url);
const { chromium } = require(join(dirname(fileURLToPath(import.meta.url)), "../../web/node_modules/playwright"));

const generationId = process.argv[2] ?? "8cd48d4e-f264-490e-a7c7-a3f7b2cec7c8";
const webBaseUrl = process.argv[3] ?? "http://localhost:5174";
const waitMs = Number(process.argv[4] ?? "90000");

async function main() {
  loadLocalEnv();
  const env = validateEnv();
  const prisma = new PrismaClient();

  const row = await prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    select: {
      ownerId: true,
      status: true,
      awaitingSandboxValidation: true,
      latestProjectHash: true,
    },
  });

  const sessionService = new SessionService(prisma, env);
  const token = sessionService.createToken();
  await sessionService.createSession({ userId: row.ownerId, token });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
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
  const sandpackLogs: string[] = [];
  const apiPosts: Array<Record<string, unknown>> = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[sandpack]")) sandpackLogs.push(text);
  });

  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes(`/api/v1/generations/${generationId}/sandbox-validation`) && resp.request().method() === "POST") {
      apiPosts.push({
        phase: "response",
        status: resp.status(),
        body: (await resp.text().catch(() => "")).slice(0, 1200),
      });
    }
  });

  await page.goto(`${webBaseUrl}/generations/${generationId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("[data-sandpack-preview-root], [class*='sp-']", { timeout: 60000 }).catch(() => undefined);
  await page.waitForTimeout(waitMs);

  const statusResponse = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    return { status: res.status, body: await res.json() };
  }, generationId);

  await context.close();
  await browser.close();
  await prisma.$disconnect();

  console.log(
    JSON.stringify(
      {
        generationId,
        before: {
          status: row.status,
          awaitingSandboxValidation: row.awaitingSandboxValidation,
          projectHash: row.latestProjectHash,
        },
        after: {
          generationStatus: statusResponse.body?.status,
          awaitingSandboxValidation: statusResponse.body?.awaitingSandboxValidation,
          projectHash: statusResponse.body?.projectHash,
          sandboxValidationHash: statusResponse.body?.sandboxValidation?.projectHash ?? null,
          compilationSuccess: statusResponse.body?.sandboxValidation?.compilation?.success ?? null,
          runtimeSuccess: statusResponse.body?.sandboxValidation?.runtime?.success ?? null,
          visualComparisonAllowed: statusResponse.body?.visualComparisonAllowed ?? null,
        },
        sandpackLogCount: sandpackLogs.length,
        sandpackLogs: sandpackLogs.slice(0, 20),
        sandboxValidationPosts: apiPosts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
