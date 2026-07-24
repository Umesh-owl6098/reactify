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
  ENABLE_REPAIR: true,
  ENABLE_INSPECTOR: true,
  ENABLE_ACCESSIBILITY: true,
  ENABLE_GENERATION_PLAN_EDITING: true,
  MAX_REPAIR_ATTEMPTS: 3,
  MAX_PATCH_FILE_BYTES: 512 * 1024,
  MAX_PATCH_TOTAL_BYTES: 2 * 1024 * 1024,
  MAX_EXPORT_FILES: 200,
  MAX_EXPORT_FILE_BYTES: 512 * 1024,
  MAX_EXPORT_TOTAL_BYTES: 5 * 1024 * 1024,
  MAX_EXPORT_ZIP_BYTES: 8 * 1024 * 1024,
  MAX_EDIT_INSTRUCTION_LENGTH: 2000,
  MIN_EDIT_INSTRUCTION_LENGTH: 3,
  MAX_EDIT_CLARIFICATION_ROUNDS: 3,
  HIGH_RISK_FILE_THRESHOLD: 5,
  MAX_EDIT_SCOPE_RATIO: 0.5,
  VISUAL_COMPARISON_STORAGE_DIR: "storage/comparisons",
  MAX_PREVIEW_SCREENSHOT_BYTES: 5 * 1024 * 1024,
  MAX_PREVIEW_SCREENSHOT_DIMENSION: 4096,
  MIN_PREVIEW_SCREENSHOT_DIMENSION: 120,
  VISUAL_COMPARISON_NOISE_THRESHOLD: 24,
  VISUAL_COMPARISON_REGION_MERGE_DISTANCE: 24,
  VISUAL_COMPARISON_MAX_REGIONS: 12,
  VISUAL_COMPARISON_MIN_REGION_SIZE: 16,
  VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD: 92,
  VISUAL_CORRECTION_RECOMMEND_THRESHOLD: 85,
  VISUAL_CORRECTION_MIN_IMPROVEMENT: 2,
  MAX_VISUAL_CORRECTION_ATTEMPTS: 3,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgresql://reactify:reactify_dev@localhost:5434/reactify_test",
  DATABASE_CONNECTION_LIMIT: 5,
  DATABASE_QUERY_TIMEOUT_MS: 30_000,
};

export async function createTestImage(storageDir: string): Promise<string> {
  const storage = new ImageStorage(storageDir);
  const stored = await storage.save(PNG_1X1, "image/png");
  return stored.imageId;
}

export async function createTestServer(options: { aiProvider?: AIProvider; storageDir?: string; useDatabase?: boolean } = {}) {
  const resolvedStorageDir = options.storageDir ?? (await mkdtemp(join(tmpdir(), "reactify-test-")));
  const pipeline = createPipelineServices(new ImageStorage(resolvedStorageDir), {
    env: testEnv,
    aiProvider: options.aiProvider,
  });
  const { app } = await buildServer(testEnv, {
    storageDir: resolvedStorageDir,
    pipeline,
    enablePersistence: options.useDatabase ?? false,
  });

  return {
    app,
    storageDir: resolvedStorageDir,
    pipeline,
  };
}

export async function waitForGenerationStatus(
  getStatus: () => Promise<{ status: string; awaitingPlanConfirmation?: boolean; awaitingSandboxValidation?: boolean }>,
  expected: string,
  timeoutMs = 5000,
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
export {
  completeSandboxValidation,
  createFailedCompilationSandboxValidationReport,
  createFailedRuntimeSandboxValidationReport,
  createSuccessfulSandboxValidationReport,
  getFixtureProjectHash,
  submitSandboxValidationReport,
  waitForAwaitingSandboxValidation,
} from "./sandboxValidationHelpers.js";
