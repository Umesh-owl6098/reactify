import { z } from "zod";
const EnvSchema = z.object({
    PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    IMAGE_MAX_BYTES: z.coerce.number().default(10_485_760),
    IMAGE_STORAGE_DIR: z.string().default("storage/images"),
    ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
});
export function validateEnv(env = process.env) {
    const result = EnvSchema.safeParse(env);
    if (!result.success) {
        console.error("Invalid environment variables:", result.error.format());
        process.exit(1);
    }
    return result.data;
}
export function getAllowedOrigins(env) {
    return env.ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
}
//# sourceMappingURL=env.js.map