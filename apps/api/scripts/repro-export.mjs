const API = process.env.API_URL ?? "http://localhost:3001";
const PROXY = process.env.PROXY_URL ?? "http://localhost:5174";

async function json(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function main() {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.append("image", new Blob([png], { type: "image/png" }), "test.png");
  const uploadRes = await fetch(`${API}/api/v1/images`, { method: "POST", body: form });
  const upload = await uploadRes.json();
  console.log("upload", uploadRes.status, upload);

  const genRes = await json("POST", `${API}/api/v1/generations`, { imageId: upload.imageId });
  console.log("generation", genRes.status, genRes.body);
  const generationId = genRes.body.generationId;

  for (let i = 0; i < 40; i += 1) {
    const status = await json("GET", `${API}/api/v1/generations/${generationId}`);
    if (status.body.status === "Planning" && status.body.awaitingPlanConfirmation) {
      break;
    }
    if (status.body.status === "Failed") {
      console.log("generation failed early", status.body.errors);
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const statusBeforeConfirm = await json("GET", `${API}/api/v1/generations/${generationId}`);
  const plan = statusBeforeConfirm.body.outputs.generationPlan;
  const confirmRes = await json("POST", `${API}/api/v1/generations/${generationId}/confirm-plan`, { plan });
  console.log("confirm", confirmRes.status);

  let projectHash = null;
  for (let i = 0; i < 30; i += 1) {
    const status = await json("GET", `${API}/api/v1/generations/${generationId}`);
    if (status.body.awaitingSandboxValidation && status.body.projectHash) {
      projectHash = status.body.projectHash;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("projectHash", projectHash);

  const sandboxRes = await json("POST", `${API}/api/v1/generations/${generationId}/sandbox-validation`, {
    generationId,
    projectHash,
    compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
    runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
    validatedAt: new Date().toISOString(),
  });
  console.log("sandbox", sandboxRes.status, sandboxRes.body);

  await new Promise((r) => setTimeout(r, 1000));
  const readyStatus = await json("GET", `${API}/api/v1/generations/${generationId}`);
  console.log("ready", readyStatus.body.status, "exportAllowed", readyStatus.body.exportAllowed);

  const payload = {
    projectName: "MockLandingPage",
    includeMetadata: true,
    includeGenerationSummary: false,
  };

  const apiExport = await json("POST", `${API}/api/v1/generations/${generationId}/exports`, payload);
  console.log("api export", apiExport.status, apiExport.body);

  const proxyExport = await json("POST", `${PROXY}/api/v1/generations/${generationId}/exports`, payload);
  console.log("proxy export", proxyExport.status, proxyExport.body);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
