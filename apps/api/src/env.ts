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

  return parsed;
}

export function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
