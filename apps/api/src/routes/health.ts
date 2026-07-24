import type { FastifyInstance } from "fastify";
import { APP_VERSION } from "@reactify/shared";

export interface HealthResponse {
  status: "ok";
  version: string;
  timestamp: string;
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  });
}
