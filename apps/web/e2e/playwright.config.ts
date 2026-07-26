import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_DIR, STATE_PATH } from "./paths.js";

const WEB_BASE_URL = process.env.E2E_WEB_URL ?? "http://localhost:5174";

/**
 * The config lives beside the specs so Playwright resolves the local tsconfig
 * rather than the app's project-reference one, which it cannot load.
 *
 * The suite drives an already-running dev stack instead of starting one,
 * because the workflow it covers includes restarting the API mid-run and a
 * Playwright-managed `webServer` would fight that.
 */
export default defineConfig({
  testDir: ".",
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: join(E2E_DIR, "..", "test-results"),
  use: {
    baseURL: WEB_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "workflow",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"], storageState: STATE_PATH },
    },
  ],
});
