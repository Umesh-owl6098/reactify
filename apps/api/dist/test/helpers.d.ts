import { writeFile } from "node:fs/promises";
import type { Env } from "../env.js";
export declare const PNG_1X1: Buffer<ArrayBuffer>;
export declare const testEnv: Env;
export declare function createTestImage(storageDir: string): Promise<string>;
export declare function createTestServer(storageDir?: string): Promise<{
    app: import("fastify").FastifyInstance<import("http").Server<typeof import("http").IncomingMessage, typeof import("http").ServerResponse>, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    storageDir: string;
    pipeline: {
        store: import("../pipeline/store.js").GenerationStore;
        registry: import("../pipeline/registry.js").StageRegistry;
        runner: import("../pipeline/PipelineRunner.js").PipelineRunner;
    };
}>;
export declare function waitForGenerationStatus(getStatus: () => Promise<{
    status: string;
}>, expected: string, timeoutMs?: number): Promise<void>;
export { writeFile };
//# sourceMappingURL=helpers.d.ts.map