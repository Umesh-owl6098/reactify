import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AIProvider } from "@reactify/shared";
import type { Env } from "../env.js";
import { ImageStorage } from "../lib/imageStorage.js";
import { createPipelineServices } from "../pipeline/index.js";
import { buildServer } from "../server.js";

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const testEnv: Env = {
  PORT: 3001,
  NODE_ENV: "test",
  IMAGE_MAX_BYTES: 10_485_760,
  IMAGE_STORAGE_DIR: "storage/images",
  ALLOWED_ORIGINS: "http://localhost:5173",
  AI_PROVIDER: "mock",
  ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022",
  AI_TIMEOUT_MS: 60_000,
  AI_MAX_TOKENS: 8192,
  AI_TEMPERATURE: 0.2,
};

export async function createTestImage(storageDir: string): Promise<string> {
  const storage = new ImageStorage(storageDir);
  const stored = await storage.save(PNG_1X1, "image/png");
  return stored.imageId;
}

export async function createTestServer(options: { aiProvider?: AIProvider; storageDir?: string } = {}) {
  const resolvedStorageDir = options.storageDir ?? (await mkdtemp(join(tmpdir(), "reactify-test-")));
  const pipeline = createPipelineServices(new ImageStorage(resolvedStorageDir), {
    env: testEnv,
    aiProvider: options.aiProvider,
  });
  const app = await buildServer(testEnv, {
    storageDir: resolvedStorageDir,
    pipeline,
  });

  return {
    app,
    storageDir: resolvedStorageDir,
    pipeline,
  };
}

export async function waitForGenerationStatus(
  getStatus: () => Promise<{ status: string }>,
  expected: string,
  timeoutMs = 3000,
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const status = await getStatus();
    if (status.status === expected) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for generation status "${expected}"`);
}

export { writeFile };
