import { z } from "zod";
declare const EnvSchema: z.ZodObject<{
    PORT: z.ZodDefault<z.ZodNumber>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    IMAGE_MAX_BYTES: z.ZodDefault<z.ZodNumber>;
    IMAGE_STORAGE_DIR: z.ZodDefault<z.ZodString>;
    ALLOWED_ORIGINS: z.ZodDefault<z.ZodString>;
    AI_PROVIDER: z.ZodDefault<z.ZodEnum<["anthropic", "mock"]>>;
    ANTHROPIC_API_KEY: z.ZodOptional<z.ZodString>;
    ANTHROPIC_MODEL: z.ZodDefault<z.ZodString>;
    AI_TIMEOUT_MS: z.ZodDefault<z.ZodNumber>;
    AI_MAX_TOKENS: z.ZodDefault<z.ZodNumber>;
    AI_TEMPERATURE: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    PORT: number;
    NODE_ENV: "development" | "test" | "production";
    IMAGE_MAX_BYTES: number;
    IMAGE_STORAGE_DIR: string;
    ALLOWED_ORIGINS: string;
    AI_PROVIDER: "anthropic" | "mock";
    ANTHROPIC_MODEL: string;
    AI_TIMEOUT_MS: number;
    AI_MAX_TOKENS: number;
    AI_TEMPERATURE: number;
    ANTHROPIC_API_KEY?: string | undefined;
}, {
    PORT?: number | undefined;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    IMAGE_MAX_BYTES?: number | undefined;
    IMAGE_STORAGE_DIR?: string | undefined;
    ALLOWED_ORIGINS?: string | undefined;
    AI_PROVIDER?: "anthropic" | "mock" | undefined;
    ANTHROPIC_API_KEY?: string | undefined;
    ANTHROPIC_MODEL?: string | undefined;
    AI_TIMEOUT_MS?: number | undefined;
    AI_MAX_TOKENS?: number | undefined;
    AI_TEMPERATURE?: number | undefined;
}>;
export type Env = z.infer<typeof EnvSchema>;
export declare function validateEnv(env?: NodeJS.ProcessEnv): Env;
export declare function getAllowedOrigins(env: Env): string[];
export {};
//# sourceMappingURL=env.d.ts.map