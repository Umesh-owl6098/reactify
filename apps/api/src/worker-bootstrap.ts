import path from "node:path";
import type { Env } from "./env.js";
import { EditService } from "./lib/edit/EditService.js";
import { ExportService } from "./lib/export/ExportService.js";
import { ImageStorage } from "./lib/imageStorage.js";
import { VisualComparisonService } from "./lib/visual-comparison/VisualComparisonService.js";
import { ComparisonArtifactStore } from "./lib/visual-comparison/comparisonArtifactStore.js";
import { createJobServices } from "./jobs/index.js";
import { connectDatabase, disconnectDatabase, getPrismaClient } from "./persistence/client.js";
import { initializePersistence } from "./persistence/initialize.js";
import { createPipelineServices } from "./pipeline/index.js";
import { defaultLoadPrompt } from "./prompts/loader.js";
import { createAIProvider } from "./providers/providerFactory.js";
import { UsageRepository, createUsageService, wrapWithUsageMetering } from "./usage/index.js";
import { safeRecoverExpiredReservations } from "./usage/usage-recovery.js";

export async function buildWorker(env: Env) {
  const storageDir = path.resolve(process.cwd(), env.IMAGE_STORAGE_DIR);
  const comparisonStorageDir = path.resolve(process.cwd(), env.VISUAL_COMPARISON_STORAGE_DIR);
  const storage = new ImageStorage(storageDir);
  await storage.ensureReady();
  const artifactStore = new ComparisonArtifactStore(comparisonStorageDir);
  await artifactStore.ensureReady();

  const prisma = getPrismaClient(env);
  await connectDatabase(prisma);

  const usageRepository = new UsageRepository(prisma);
  const usageService = createUsageService(env, usageRepository);
  const aiProvider = wrapWithUsageMetering(createAIProvider(env), usageService);
  const pipeline = createPipelineServices(storage, { env, aiProvider });
  const persistence = await initializePersistence(env, pipeline.store);

  const exportService = ExportService.fromEnv(env);
  const editService = EditService.fromDeps({
    aiProvider,
    loadPrompt: defaultLoadPrompt,
    env,
  });
  const visualComparisonService = VisualComparisonService.fromDeps({
    aiProvider,
    loadPrompt: defaultLoadPrompt,
    env,
    imageStorage: storage,
    artifactStore,
  });

  const { jobRunner, jobService } = createJobServices(
    prisma,
    env,
    {
      store: pipeline.store,
      runner: pipeline.runner,
      editService,
      exportService,
      visualComparisonService,
    },
    usageService,
  );

  await safeRecoverExpiredReservations(usageRepository, (event, fields) => {
    console.info({ event, ...fields });
  });

  return {
    runner: jobRunner,
    jobService,
    pipeline,
    persistence,
    usageService,
    shutdown: async () => {
      await disconnectDatabase(prisma);
    },
  };
}
