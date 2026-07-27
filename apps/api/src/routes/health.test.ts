import { describe, expect, it } from "vitest";
import { buildServer } from "../server.js";
import { testEnv } from "../test/helpers.js";
import { createWorkerPresenceStore } from "../jobs/worker-presence.js";
import { LocalStorageProvider } from "../lib/storage/localStorageProvider.js";
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
    const provider = new LocalStorageProvider(storageDir);
    const workerPresenceStore = createWorkerPresenceStore({
      storage: provider,
      presenceKey: "system/worker-presence.json",
    });
    await workerPresenceStore.record({
      pollIntervalMs: 1000,
      workerConcurrency: 1,
      registeredHandlers: ["design_analysis"],
    });

    const { app } = await buildServer(testEnv, {
      storageDir,
      workerPresenceStore,
      enablePersistence: false,
    });
    const response = await app.inject({ method: "GET", url: "/api/v1/system/readiness" });
    expect(response.statusCode).toBe(200);
    expect(response.json().workerAvailable).toBe(true);
    await app.close();
  });
});
