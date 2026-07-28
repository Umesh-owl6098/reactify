import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AIProvider } from "@reactify/shared";
import type { Env } from "../env.js";
import { ImageStorage } from "../lib/imageStorage.js";
import { LocalStorageProvider } from "../lib/storage/localStorageProvider.js";
import { createPipelineServices } from "../pipeline/index.js";
import { buildServer, type BuildServerOptions } from "../server.js";
import { registerTestUser } from "./authHelpers.js";

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export const testEnv: Env = {
  PORT: 3001,
  NODE_ENV: "test",
  IMAGE_MAX_BYTES: 10_485_760,
  IMAGE_STORAGE_DIR: "storage/images",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_ROOT: "storage",
  HOST: "127.0.0.1",
  TRUST_PROXY: false,
  SESSION_COOKIE_SAME_SITE: "lax" as const,
  S3_REGION: "auto",
  ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:5174",
  AUTH_ALLOWED_ORIGINS: "http://localhost:5174",
  SESSION_COOKIE_NAME: "reactify_session",
  SESSION_TTL_HOURS: 168,
  SESSION_TOKEN_BYTES: 32,
  PASSWORD_HASH_MEMORY_COST: 4096,
  PASSWORD_HASH_TIME_COST: 1,
  PASSWORD_HASH_PARALLELISM: 1,
  AUTH_RATE_LIMIT_WINDOW_MS: 900_000,
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: 100,
  AI_PROVIDER: "mock",
  ANTHROPIC_MODEL: "claude-3-5-sonnet-20241022",
  OPENAI_MODEL: "gpt-4o",
  OPENAI_MAX_RETRIES: 0,
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
  EXPORT_STORAGE_DIR: "storage/exports",
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
  JOB_WORKER_POLL_INTERVAL_MS: 200,
  JOB_LOCK_TTL_MS: 120_000,
  JOB_HEARTBEAT_INTERVAL_MS: 15_000,
  JOB_SHUTDOWN_GRACE_MS: 5_000,
  JOB_DEFAULT_MAX_ATTEMPTS: 3,
  JOB_EXPORT_MAX_ATTEMPTS: 2,
  JOB_RETRY_BASE_DELAY_MS: 50,
  JOB_RETRY_MAX_DELAY_MS: 500,
  JOB_BATCH_SIZE: 5,
  WORKER_CONCURRENCY: 2,
  JOB_INLINE_EXECUTION: false,
  JOB_STALE_RECOVERY_INTERVAL_MS: 60_000,
  JOB_STALE_GENERATION_THRESHOLD_MS: 120_000,
  JOB_MISSING_GRACE_MS: 60_000,
  AI_USAGE_RESERVATION_TTL_MINUTES: 120,
  AI_BUDGET_WARNING_PERCENT: 80,
};

export async function createTestImage(storageDir: string, ownerId?: string): Promise<string> {
  const storage = new ImageStorage(new LocalStorageProvider(storageDir));
  const stored = await storage.save(PNG_1X1, "image/png", undefined, ownerId);
  return stored.imageId;
}

export async function createTestServer(
  options: {
    aiProvider?: AIProvider;
    storageDir?: string;
    useDatabase?: boolean;
    jobs?: BuildServerOptions["jobs"];
    pipelineEnv?: Partial<Env>;
  } = {},
) {
  process.env.AUTH_SKIP_ORIGIN_CHECK = "true";
  const resolvedStorageDir = options.storageDir ?? (await mkdtemp(join(tmpdir(), "reactify-test-")));
  const pipelineEnv = { ...testEnv, ...options.pipelineEnv };
  const pipeline = createPipelineServices(new ImageStorage(new LocalStorageProvider(resolvedStorageDir)), {
    env: pipelineEnv,
    aiProvider: options.aiProvider,
  });
  const { app } = await buildServer(testEnv, {
    storageDir: resolvedStorageDir,
    pipeline,
    enablePersistence: options.useDatabase ?? false,
    jobs: options.jobs,
  });

  const auth = await registerTestUser(app, {
    email: `test-${randomUUID()}@example.com`,
    password: "secure-password-123",
    displayName: "Test User",
  });

  return {
    app,
    storageDir: resolvedStorageDir,
    pipeline,
    authCookie: auth.cookie,
    userId: auth.userId,
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
export {
  createAuthenticatedTestImage,
  extractSessionCookie,
  registerTestUser,
  signInTestUser,
  testAuthHeaders,
  withAuth,
} from "./authHelpers.js";
