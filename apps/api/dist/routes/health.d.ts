import type { FastifyInstance } from "fastify";
export interface HealthResponse {
    status: "ok";
    version: string;
    timestamp: string;
}
export declare function registerHealthRoutes(app: FastifyInstance): Promise<void>;
//# sourceMappingURL=health.d.ts.map