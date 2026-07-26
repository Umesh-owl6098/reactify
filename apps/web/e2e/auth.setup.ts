import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { test as setup, expect } from "@playwright/test";
import { API_DIR, STATE_PATH } from "./paths.js";

const run = promisify(execFile);

const API_BASE_URL = process.env.E2E_API_URL ?? "http://localhost:3001";
const GENERATION_ID = process.env.E2E_GENERATION_ID ?? "a1178bcb-8c58-4f0a-8884-d50082445368";
const WEB_HOST = new URL(process.env.E2E_WEB_URL ?? "http://localhost:5174").hostname;

/**
 * Issues a real session for the generation's existing owner rather than forging
 * headers or rewriting anyone's credentials, so every later request is
 * authenticated exactly the way a signed-in browser would be.
 */
setup("authenticate", async ({ request }) => {
  await run("npx", ["tsx", join("scripts", "create-e2e-session.ts"), GENERATION_ID, WEB_HOST], {
    cwd: API_DIR,
    maxBuffer: 8 * 1024 * 1024,
  });

  const state = JSON.parse(await readFile(STATE_PATH, "utf8")) as {
    cookies: Array<{ name: string; value: string }>;
  };
  const cookie = state.cookies[0];
  expect(cookie?.value, "session cookie was not created").toBeTruthy();

  // Fail here rather than deep inside a workflow spec if the session is invalid.
  const probe = await request.get(`${API_BASE_URL}/api/v1/generations/${GENERATION_ID}`, {
    headers: { cookie: `${cookie!.name}=${cookie!.value}` },
  });
  expect(probe.status(), await probe.text()).toBe(200);
});
