import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IMAGE_MAX_BYTES: z.coerce.number().default(10_485_760),
  IMAGE_STORAGE_DIR: z.string().default("storage/images"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20241022"),
  AI_TIMEOUT_MS: z.coerce.number().default(60_000),
  AI_MAX_TOKENS: z.coerce.number().default(8192),
  AI_TEMPERATURE: z.coerce.number().default(0.2),
  ENABLE_REPAIR: z.coerce.boolean().default(true),
  ENABLE_INSPECTOR: z.coerce.boolean().default(true),
  ENABLE_ACCESSIBILITY: z.coerce.boolean().default(true),
  ENABLE_GENERATION_PLAN_EDITING: z.coerce.boolean().default(true),
  MAX_REPAIR_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  MAX_PATCH_FILE_BYTES: z.coerce.number().int().positive().default(512 * 1024),
  MAX_PATCH_TOTAL_BYTES: z.coerce.number().int().positive().default(2 * 1024 * 1024),
  MAX_EXPORT_FILES: z.coerce.number().int().positive().default(200),
  MAX_EXPORT_FILE_BYTES: z.coerce.number().int().positive().default(512 * 1024),
  MAX_EXPORT_TOTAL_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  MAX_EXPORT_ZIP_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  MAX_EDIT_INSTRUCTION_LENGTH: z.coerce.number().int().positive().default(2000),
  MIN_EDIT_INSTRUCTION_LENGTH: z.coerce.number().int().positive().default(3),
  MAX_EDIT_CLARIFICATION_ROUNDS: z.coerce.number().int().positive().default(3),
  HIGH_RISK_FILE_THRESHOLD: z.coerce.number().int().positive().default(5),
  MAX_EDIT_SCOPE_RATIO: z.coerce.number().min(0).max(1).default(0.5),
  VISUAL_COMPARISON_STORAGE_DIR: z.string().default("storage/comparisons"),
  MAX_PREVIEW_SCREENSHOT_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
  MAX_PREVIEW_SCREENSHOT_DIMENSION: z.coerce.number().int().positive().default(4096),
  MIN_PREVIEW_SCREENSHOT_DIMENSION: z.coerce.number().int().positive().default(120),
  VISUAL_COMPARISON_NOISE_THRESHOLD: z.coerce.number().int().min(0).max(255).default(24),
  VISUAL_COMPARISON_REGION_MERGE_DISTANCE: z.coerce.number().int().positive().default(24),
  VISUAL_COMPARISON_MAX_REGIONS: z.coerce.number().int().positive().default(12),
  VISUAL_COMPARISON_MIN_REGION_SIZE: z.coerce.number().int().positive().default(16),
  VISUAL_SIMILARITY_ACCEPTABLE_THRESHOLD: z.coerce.number().min(0).max(100).default(92),
  VISUAL_CORRECTION_RECOMMEND_THRESHOLD: z.coerce.number().min(0).max(100).default(85),
  VISUAL_CORRECTION_MIN_IMPROVEMENT: z.coerce.number().min(0).max(100).default(2),
  MAX_VISUAL_CORRECTION_ATTEMPTS: z.coerce.number().int().positive().default(3),
  DATABASE_URL: z.string().min(1),
  DATABASE_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  DATABASE_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    process.exit(1);
  }

  const parsed = result.data;

  if (parsed.AI_PROVIDER === "anthropic" && !parsed.ANTHROPIC_API_KEY) {
    if (parsed.NODE_ENV === "test") {
      return parsed;
    }

    console.error("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic");
    process.exit(1);
  }

  if (!parsed.DATABASE_URL) {
    console.error("DATABASE_URL is required. Set it in apps/api/.env or the environment.");
    process.exit(1);
  }

  return parsed;
}

export function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function resolveFeatureFlags(env: Env): import("@reactify/shared").FeatureFlags {
  return {
    enableRepair: env.ENABLE_REPAIR,
    enableInspector: env.ENABLE_INSPECTOR,
    enableAccessibility: env.ENABLE_ACCESSIBILITY,
    enableGenerationPlanEditing: env.ENABLE_GENERATION_PLAN_EDITING,
  };
}
