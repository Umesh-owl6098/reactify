import Fastify from "fastify";
import type { Env } from "./env.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildServer(env: Env) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
  });

  await registerHealthRoutes(app);

  return app;
}
