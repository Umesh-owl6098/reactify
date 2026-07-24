import { z } from "zod";
declare const EnvSchema: z.ZodObject<{
    PORT: z.ZodDefault<z.ZodNumber>;
    NODE_ENV: z.ZodDefault<z.ZodEnum<["development", "test", "production"]>>;
    IMAGE_MAX_BYTES: z.ZodDefault<z.ZodNumber>;
    IMAGE_STORAGE_DIR: z.ZodDefault<z.ZodString>;
    ALLOWED_ORIGINS: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    PORT: number;
    NODE_ENV: "development" | "test" | "production";
    IMAGE_MAX_BYTES: number;
    IMAGE_STORAGE_DIR: string;
    ALLOWED_ORIGINS: string;
}, {
    PORT?: number | undefined;
    NODE_ENV?: "development" | "test" | "production" | undefined;
    IMAGE_MAX_BYTES?: number | undefined;
    IMAGE_STORAGE_DIR?: string | undefined;
    ALLOWED_ORIGINS?: string | undefined;
}>;
export type Env = z.infer<typeof EnvSchema>;
export declare function validateEnv(env?: NodeJS.ProcessEnv): Env;
export declare function getAllowedOrigins(env: Env): string[];
export {};
//# sourceMappingURL=env.d.ts.map