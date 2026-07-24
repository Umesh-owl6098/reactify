import path from "node:path";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { getAllowedOrigins, type Env } from "./env.js";
import { ImageStorage } from "./lib/imageStorage.js";
import { createPipelineServices } from "./pipeline/index.js";
import { registerGenerationRoutes } from "./routes/generations.js";
import { registerRepairRoutes } from "./routes/repairs.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImageRoutes } from "./routes/images.js";

export interface BuildServerOptions {
  storageDir?: string;
  pipeline?: ReturnType<typeof createPipelineServices>;
}

export async function buildServer(env: Env, options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    genReqId: () => randomUUID(),
  });

  const storageDir = options.storageDir ?? path.resolve(process.cwd(), env.IMAGE_STORAGE_DIR);
  const storage = new ImageStorage(storageDir);
  await storage.ensureReady();

  const pipeline = options.pipeline ?? createPipelineServices(storage, { env });

  await app.register(cors, {
    origin: getAllowedOrigins(env),
  });

  await app.register(multipart, {
    limits: {
      fileSize: env.IMAGE_MAX_BYTES + 1024,
      files: 1,
    },
  });

  await registerHealthRoutes(app);
  await registerImageRoutes(app, env, storage);
  await registerGenerationRoutes(app, storage, pipeline.store, pipeline.runner);
  await registerRepairRoutes(app, pipeline.store, pipeline.runner);

  return app;
}
