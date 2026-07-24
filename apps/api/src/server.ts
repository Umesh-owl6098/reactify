import path from "node:path";
import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { getAllowedOrigins, type Env } from "./env.js";
import { ImageStorage } from "./lib/imageStorage.js";
import { createPipelineServices } from "./pipeline/index.js";
import { initializePersistence } from "./persistence/initialize.js";
import type { PersistenceService } from "./persistence/PersistenceService.js";
import { registerGenerationRoutes } from "./routes/generations.js";
import { registerRepairRoutes } from "./routes/repairs.js";
import { registerExportRoutes } from "./routes/exports.js";
import { registerEditRoutes, registerVersionRoutes } from "./routes/edits.js";
import { ExportService } from "./lib/export/ExportService.js";
import { EditService } from "./lib/edit/EditService.js";
import { VisualComparisonService } from "./lib/visual-comparison/VisualComparisonService.js";
import { ComparisonArtifactStore } from "./lib/visual-comparison/comparisonArtifactStore.js";
import { defaultLoadPrompt } from "./prompts/loader.js";
import { createAIProvider } from "./providers/providerFactory.js";
import type { AIProvider } from "@reactify/shared";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImageRoutes } from "./routes/images.js";
import { registerVisualComparisonRoutes } from "./routes/visual-comparisons.js";

export interface BuildServerOptions {
  storageDir?: string;
  comparisonStorageDir?: string;
  pipeline?: ReturnType<typeof createPipelineServices>;
  aiProvider?: AIProvider;
  editService?: EditService;
  visualComparisonService?: VisualComparisonService;
  persistence?: PersistenceService | null;
  enablePersistence?: boolean;
}

export async function buildServer(env: Env, options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    genReqId: () => randomUUID(),
  });

  const storageDir = options.storageDir ?? path.resolve(process.cwd(), env.IMAGE_STORAGE_DIR);
  const comparisonStorageDir =
    options.comparisonStorageDir ?? path.resolve(process.cwd(), env.VISUAL_COMPARISON_STORAGE_DIR);
  const storage = new ImageStorage(storageDir);
  await storage.ensureReady();
  const artifactStore = new ComparisonArtifactStore(comparisonStorageDir);
  await artifactStore.ensureReady();

  const aiProvider = options.aiProvider ?? createAIProvider(env);
  const pipeline = options.pipeline ?? createPipelineServices(storage, { env, aiProvider });
  let persistence = options.persistence ?? null;

  if (options.enablePersistence !== false && persistence === null && env.NODE_ENV !== "test") {
    persistence = await initializePersistence(env, pipeline.store);
  } else if (options.enablePersistence === true && persistence === null) {
    persistence = await initializePersistence(env, pipeline.store);
  }

  const exportService = ExportService.fromEnv(env);
  const editService =
    options.editService ??
    EditService.fromDeps({
      aiProvider,
      loadPrompt: defaultLoadPrompt,
      env,
    });
  const visualComparisonService =
    options.visualComparisonService ??
    VisualComparisonService.fromDeps({
      aiProvider,
      loadPrompt: defaultLoadPrompt,
      env,
      imageStorage: storage,
      artifactStore,
    });

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
  await registerImageRoutes(app, env, storage, persistence ?? undefined);
  await registerGenerationRoutes(app, storage, pipeline.store, pipeline.runner, persistence ?? undefined);
  await registerRepairRoutes(app, pipeline.store, pipeline.runner);
  await registerExportRoutes(app, pipeline.store, exportService);
  await registerEditRoutes(app, pipeline.store, editService);
  await registerVersionRoutes(app, pipeline.store, editService);
  await registerVisualComparisonRoutes(app, pipeline.store, visualComparisonService);

  return { app, persistence };
}
