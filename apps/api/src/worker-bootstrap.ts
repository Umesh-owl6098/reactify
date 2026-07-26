import type { Env } from "./env.js";
import { EditService } from "./lib/edit/EditService.js";
import { ExportService } from "./lib/export/ExportService.js";
import { ExportArtifactStore } from "./lib/export/exportArtifactStore.js";
import { ImageStorage } from "./lib/imageStorage.js";
import { VisualComparisonService } from "./lib/visual-comparison/VisualComparisonService.js";
import { ComparisonArtifactStore } from "./lib/visual-comparison/comparisonArtifactStore.js";
import { createJobServices } from "./jobs/index.js";
import { resolveAppPaths } from "./config/paths.js";
import { connectDatabase, disconnectDatabase, getPrismaClient, verifyDatabaseAvailability } from "./persistence/client.js";
import { verifySchemaReadiness } from "./persistence/schema-readiness.js";
import { logDatabaseIdentity } from "./lib/database-identity.js";
import { initializePersistence } from "./persistence/initialize.js";
import { createPipelineServices } from "./pipeline/index.js";
import { defaultLoadPrompt } from "./prompts/loader.js";
import { createAIProvider } from "./providers/providerFactory.js";
import { UsageRepository, createUsageService, wrapWithUsageMetering } from "./usage/index.js";
import { safeRecoverExpiredReservations } from "./usage/usage-recovery.js";

export async function buildWorker(env: Env) {
  const paths = resolveAppPaths(env);
  const storage = new ImageStorage(paths.imageStorageDir);
  await storage.ensureReady();
  const artifactStore = new ComparisonArtifactStore(paths.comparisonStorageDir);
  await artifactStore.ensureReady();
  const exportArtifactStore = new ExportArtifactStore(paths.exportStorageDir);
  await exportArtifactStore.ensureReady();

  const prisma = getPrismaClient(env);
  await connectDatabase(prisma);
  await verifyDatabaseAvailability(prisma);

  const schema = await verifySchemaReadiness(prisma);
  if (!schema.ready) {
    console.error({
      event: "worker_schema_not_ready",
      message: schema.message,
      missingTables: schema.missingTables,
    });
    process.exit(1);
  }

  console.info({ event: "postgresql_connection_confirmed" });
  await logDatabaseIdentity(prisma, env.DATABASE_URL, "worker");

  const usageRepository = new UsageRepository(prisma);
  const usageService = createUsageService(env, usageRepository);
  const aiProvider = wrapWithUsageMetering(createAIProvider(env), usageService);
  const pipeline = createPipelineServices(storage, { env, aiProvider });
  const persistence = await initializePersistence(env, pipeline.store);

  const exportService = ExportService.fromEnv(env, exportArtifactStore);
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
      loadGenerationById: (generationId) => persistence.generations.findById(generationId),
    },
    usageService,
    paths.workerPresenceFile,
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
    paths,
  };
}
