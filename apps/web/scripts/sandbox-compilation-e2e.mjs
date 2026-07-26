import { chromium } from "playwright";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, "../../api/test-fixtures/login-form-screenshot.png");
const BASE = "http://localhost:5174";
const POLL_MS = 5000;
const MAX_POLLS = 240;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const sandpackLogs = [];
  const sandboxPosts = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[sandpack]")) sandpackLogs.push(text);
  });
  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes("/api/v1/generations/") && url.includes("/sandbox-validation") && resp.request().method() === "POST") {
      sandboxPosts.push({
        status: resp.status(),
        body: (await resp.text().catch(() => "")).slice(0, 1000),
      });
    }
  });

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  if (page.url().includes("/sign-in")) {
    await page.getByRole("link", { name: /create one/i }).click();
    const email = `sandbox-${Date.now()}@example.com`;
    await page.getByLabel(/^email$/i).fill(email);
    await page.getByLabel(/display name/i).fill("Sandbox E2E");
    await page.getByLabel(/^password$/i).fill("secure-password-123");
    await page.getByLabel(/confirm password/i).fill("secure-password-123");
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  }

  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.locator('input[type="file"]').setInputFiles(FIXTURE);
  await page.waitForURL(/\/generations\/[0-9a-f-]{36}/i, { timeout: 120000 });
  const generationId = page.url().match(/[0-9a-f-]{36}/i)?.[0];
  console.log("generationId", generationId);

  let planConfirmed = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    const text = await page.locator("body").innerText();
    const currentStatus = text.match(/Current status: ([^\n]+)/)?.[1] ?? null;

    if (text.includes("Review generation plan") && !planConfirmed) {
      const confirm = page.getByRole("button", { name: /confirm generation plan|confirm plan/i });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click();
        planConfirmed = true;
        console.log("plan confirmed");
      }
    }

    if (currentStatus === "Compiling" && sandboxPosts.length === 0) {
      console.log("compiling detected, waiting for sandbox POST...");
      await page.waitForTimeout(45000);
      break;
    }

    if (currentStatus === "Ready") break;
    if (text.includes("Generation failed") || currentStatus === "Failed") {
      console.log("failed at", currentStatus);
      break;
    }

    await page.waitForTimeout(POLL_MS);
  }

  const snap = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    return res.json();
  }, generationId);

  console.log(
    JSON.stringify(
      {
        generationId,
        finalStatus: snap.status,
        awaitingSandboxValidation: snap.awaitingSandboxValidation,
        projectHash: snap.projectHash,
        sandboxValidation: snap.sandboxValidation,
        sandpackLogs,
        sandboxPosts,
      },
      null,
      2,
    ),
  );

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
