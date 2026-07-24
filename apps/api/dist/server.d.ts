import Fastify from "fastify";
import { type Env } from "./env.js";
import { createPipelineServices } from "./pipeline/index.js";
export interface BuildServerOptions {
    storageDir?: string;
    pipeline?: ReturnType<typeof createPipelineServices>;
}
export declare function buildServer(env: Env, options?: BuildServerOptions): Promise<Fastify.FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, Fastify.FastifyBaseLogger, Fastify.FastifyTypeProviderDefault>>;
//# sourceMappingURL=server.d.ts.map