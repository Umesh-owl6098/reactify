import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
};

export async function createTestImage(storageDir: string): Promise<string> {
  const storage = new ImageStorage(storageDir);
  const stored = await storage.save(PNG_1X1, "image/png");
  return stored.imageId;
}

export async function createTestServer(storageDir?: string) {
  const resolvedStorageDir = storageDir ?? (await mkdtemp(join(tmpdir(), "reactify-test-")));
  const pipeline = createPipelineServices(new ImageStorage(resolvedStorageDir));
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
