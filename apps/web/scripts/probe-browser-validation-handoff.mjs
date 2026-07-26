/**
 * Handoff probe: open an existing generation awaiting browser validation and
 * observe whether Sandpack mounts, the validation callback runs, and POST is sent.
 * Does NOT create uploads or rerun the pipeline.
 */
import { chromium } from "playwright";

const generationId = process.argv[2] ?? "cdbc3aab-d9c4-4256-84fa-59d5f91c51ba";
const ownerEmail = process.argv[3] ?? process.env.PROBE_OWNER_EMAIL ?? "umesh@gmail.com";
const ownerPassword = process.argv[4] ?? "secure-password-123";
const baseUrl = "http://localhost:5174";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  const sandpackLogs = [];
  const apiPosts = [];
  const apiGets = [];

  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[sandpack]")) sandpackLogs.push({ at: Date.now(), text });
  });

  const fileRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes(`/api/v1/generations/${generationId}/files`)) {
      fileRequests.push({ phase: "request", method: req.method(), url });
    }
    if (url.includes(`/api/v1/generations/${generationId}/sandbox-validation`) && req.method() === "POST") {
      apiPosts.push({ phase: "request", url, body: req.postData()?.slice(0, 800) ?? null });
    }
    if (url.includes(`/api/v1/generations/${generationId}`) && req.method() === "GET" && !url.includes("/files")) {
      apiGets.push({ phase: "request", url });
    }
  });

  page.on("response", async (resp) => {
    const url = resp.url();
    if (url.includes(`/api/v1/generations/${generationId}/files`)) {
      fileRequests.push({
        phase: "response",
        method: resp.request().method(),
        status: resp.status(),
        url,
        body: (await resp.text().catch(() => "")).slice(0, 300),
      });
    }
    if (url.includes(`/api/v1/generations/${generationId}/sandbox-validation`) && resp.request().method() === "POST") {
      apiPosts.push({
        phase: "response",
        status: resp.status(),
        body: (await resp.text().catch(() => "")).slice(0, 1000),
      });
    }
  });

  // Sign in as generation owner
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: "networkidle" });
  await page.getByLabel(/^email$/i).fill(ownerEmail);
  await page.getByLabel(/^password$/i).fill(ownerPassword);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(`${baseUrl}/`, { timeout: 20000 }).catch(() => undefined);

  await page.goto(`${baseUrl}/generations/${generationId}`, { waitUntil: "networkidle" });
  console.log("page_url", page.url());

  const bodyAtLoad = await page.locator("body").innerText();
  console.log("ui_status_line", bodyAtLoad.match(/Current status: ([^\n]+)/)?.[1] ?? null);
  console.log("ui_awaiting_browser", bodyAtLoad.includes("Awaiting browser validation") || bodyAtLoad.includes("browser validation"));
  console.log("ui_preview_placeholder", bodyAtLoad.includes("Live preview will appear when sandbox validation starts"));
  console.log("ui_generated_workspace", bodyAtLoad.includes("Generated project workspace"));

  const sandpackVisible = await page.locator("[class*='sp-']").count();
  const previewRoot = await page.locator("[data-sandpack-preview-root]").count();
  console.log("sandpack_dom_markers", { sandpackVisible, previewRoot });

  // Wait through one full compilation timeout window + buffer
  console.log("waiting_45s_for_handoff...");
  await page.waitForTimeout(45_000);

  const snap = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/generations/${id}`, { credentials: "include" });
    return { status: res.status, body: await res.json() };
  }, generationId);

  console.log(
    JSON.stringify(
      {
        generationId,
        ownerEmail,
        afterWait: {
          generationStatus: snap.body?.status,
          awaitingSandboxValidation: snap.body?.awaitingSandboxValidation,
          projectHash: snap.body?.projectHash,
          sandboxValidation: snap.body?.sandboxValidation,
        },
        sandpackLogs,
        apiPosts,
        apiGetCount: apiGets.length,
        fileRequests,
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
