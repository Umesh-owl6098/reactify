import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { testEnv } from "../test/helpers.js";
import { recordWorkerPresence } from "../jobs/worker-presence.js";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("health and readiness routes", () => {
  it("returns ok from GET /health", async () => {
    const { app } = await buildServer(testEnv);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    await app.close();
  });

  it("returns readiness details from GET /ready", async () => {
    const { app } = await buildServer(testEnv, { enablePersistence: false });
    const response = await app.inject({ method: "GET", url: "/ready" });
    const body = response.json() as {
      status: string;
      checks: { database: string; schema: string; worker: string; configuration: string };
    };
    expect([200, 503]).toContain(response.statusCode);
    expect(body.checks.database).toBe("ok");
    expect(["ok", "failed"]).toContain(body.checks.schema);
    await app.close();
  });

  it("reports worker availability from system readiness endpoint", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "reactify-ready-"));
    const presenceFile = join(storageDir, ".worker-presence.json");
    await recordWorkerPresence(presenceFile, {
      pollIntervalMs: 1000,
      workerConcurrency: 1,
      registeredHandlers: ["design_analysis"],
    });

    const env = { ...testEnv, IMAGE_STORAGE_DIR: storageDir };
    const { app } = await buildServer(env, { storageDir, enablePersistence: false });
    const response = await app.inject({ method: "GET", url: "/api/v1/system/readiness" });
    expect(response.statusCode).toBe(200);
    expect(response.json().workerAvailable).toBe(true);
    await app.close();
  });
});
