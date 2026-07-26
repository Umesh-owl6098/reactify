import { chromium } from "playwright";

const generationId = process.argv[2] ?? "859852b2-39dc-4f92-9d59-a87b41dbeaa3";
const baseUrl = "http://localhost:5174";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const requests = [];
  page.on("request", (req) => {
    if (req.url().includes("sandbox-validation")) {
      requests.push({ type: "request", method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 500) });
    }
  });
  page.on("response", async (resp) => {
    if (resp.url().includes("sandbox-validation")) {
      requests.push({
        type: "response",
        method: resp.request().method(),
        url: resp.url(),
        status: resp.status(),
        body: (await resp.text().catch(() => "")).slice(0, 1000),
      });
    }
  });
  page.on("console", (msg) => {
    if (msg.text().includes("[sandpack]")) {
      console.log("console:", msg.text());
    }
  });

  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
  const email = `diag-${Date.now()}@example.com`;
  await page.getByRole("link", { name: /create one/i }).click();
  await page.getByLabel(/^email$/i).fill(email);
  await page.getByLabel(/display name/i).fill("Diag User");
  await page.getByLabel(/^password$/i).fill("secure-password-123");
  await page.getByLabel(/confirm password/i).fill("secure-password-123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 20000 });

  await page.goto(`${baseUrl}/generations/${generationId}`, { waitUntil: "networkidle" });
  console.log("loaded", page.url());
  await page.waitForTimeout(45000);

  const status = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    return res.json();
  }, generationId);

  console.log(
    JSON.stringify(
      {
        generationId,
        status: status.status,
        awaitingSandboxValidation: status.awaitingSandboxValidation,
        projectHash: status.projectHash,
        sandboxValidation: status.sandboxValidation,
        requests,
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
