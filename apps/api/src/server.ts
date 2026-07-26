import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { createAuthServices } from "./auth/index.js";
import { registerAuthHooks, type AuthContext } from "./auth/middleware.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { AuthorizationService } from "./auth/AuthorizationService.js";
import { getAllowedOrigins, type Env } from "./env.js";
import { ImageStorage } from "./lib/imageStorage.js";
import { createPipelineServices } from "./pipeline/index.js";
import { resolveAppPaths } from "./config/paths.js";
import { getPrismaClient } from "./persistence/client.js";
import { ImageRepository } from "./persistence/repositories/ImageRepository.js";
import { initializePersistence } from "./persistence/initialize.js";
import type { PersistenceService } from "./persistence/PersistenceService.js";
import { registerGenerationRoutes } from "./routes/generations.js";
import { registerRepairRoutes } from "./routes/repairs.js";
import { registerExportRoutes } from "./routes/exports.js";
import { registerEditRoutes, registerVersionRoutes } from "./routes/edits.js";
import { ExportService } from "./lib/export/ExportService.js";
import { ExportArtifactStore } from "./lib/export/exportArtifactStore.js";
import { EditService } from "./lib/edit/EditService.js";
import { VisualComparisonService } from "./lib/visual-comparison/VisualComparisonService.js";
import { ComparisonArtifactStore } from "./lib/visual-comparison/comparisonArtifactStore.js";
import { defaultLoadPrompt } from "./prompts/loader.js";
import { createAIProvider } from "./providers/providerFactory.js";
import type { AIProvider } from "@reactify/shared";
import { registerHealthRoutes } from "./routes/health.js";
import { registerImageRoutes } from "./routes/images.js";
import { registerVisualComparisonRoutes } from "./routes/visual-comparisons.js";
import { registerJobRoutes } from "./routes/jobs.js";
import { createJobServices, type JobServices } from "./jobs/index.js";
import { UsageRepository, createUsageService, wrapWithUsageMetering } from "./usage/index.js";
import { registerUsageRoutes, registerUsageErrorHandler } from "./routes/usage.js";
import { safeRecoverExpiredReservations } from "./usage/usage-recovery.js";

export interface BuildServerOptions {
  storageDir?: string;
  comparisonStorageDir?: string;
  pipeline?: ReturnType<typeof createPipelineServices>;
  aiProvider?: AIProvider;
  editService?: EditService;
  visualComparisonService?: VisualComparisonService;
  persistence?: PersistenceService | null;
  enablePersistence?: boolean;
  authorization?: AuthorizationService;
  authContext?: AuthContext;
  jobs?: JobServices | null;
  startWorker?: boolean;
}

export async function buildServer(env: Env, options: BuildServerOptions = {}) {
  const app = Fastify({
    logger: env.NODE_ENV !== "test",
    genReqId: () => randomUUID(),
  });

  const paths = resolveAppPaths(env);
  const storageDir = options.storageDir ?? paths.imageStorageDir;
  const comparisonStorageDir = options.comparisonStorageDir ?? paths.comparisonStorageDir;
  const storage = new ImageStorage(storageDir);
  await storage.ensureReady();
  const artifactStore = new ComparisonArtifactStore(comparisonStorageDir);
  await artifactStore.ensureReady();
  const exportArtifactStore = new ExportArtifactStore(paths.exportStorageDir);
  await exportArtifactStore.ensureReady();

  const prisma = getPrismaClient(env);
  const imageRepository = new ImageRepository(prisma);

  let persistence = options.persistence ?? null;
  const baseAiProvider = options.aiProvider ?? createAIProvider(env);
  let usageService: ReturnType<typeof createUsageService> | undefined;

  if (persistence) {
    usageService = createUsageService(env, new UsageRepository(prisma));
  }

  const aiProvider =
    usageService && !options.aiProvider ? wrapWithUsageMetering(baseAiProvider, usageService) : baseAiProvider;
  const pipeline =
    options.pipeline ??
    createPipelineServices(storage, {
      env,
      aiProvider,
    });

  if (options.enablePersistence !== false && persistence === null && env.NODE_ENV !== "test") {
    persistence = await initializePersistence(env, pipeline.store);
  } else if (options.enablePersistence === true && persistence === null) {
    persistence = await initializePersistence(env, pipeline.store);
  }

  if (persistence && !usageService) {
    usageService = createUsageService(env, new UsageRepository(prisma));
  }

  const exportService = ExportService.fromEnv(env, exportArtifactStore);
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

  let jobs = options.jobs ?? null;
  if (jobs === null && persistence) {
    jobs = createJobServices(
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
    );
    usageService = jobs.usageService;
    if (options.startWorker !== false && env.JOB_INLINE_EXECUTION) {
      jobs.jobRunner.start();
    }
  }

  const authServices =
    options.authorization && options.authContext
      ? {
          authorizationService: options.authorization,
          authContext: options.authContext,
          repository: createAuthServices(env, prisma, pipeline.store).repository,
        }
      : (() => {
          const created = createAuthServices(env, prisma, pipeline.store, storage);
          return {
            authorizationService: created.authorizationService,
            authContext: {
              authService: created.authService,
              sessionService: created.sessionService,
              env,
            },
            repository: created.repository,
          };
        })();

  await app.register(cors, {
    origin: getAllowedOrigins(env),
    credentials: true,
  });

  await app.register(cookie);

  await app.register(multipart, {
    limits: {
      fileSize: env.IMAGE_MAX_BYTES + 1024,
      files: 1,
    },
  });

  registerUsageErrorHandler(app);

  registerAuthHooks(app, authServices.authContext);
  await registerAuthRoutes(app, authServices.authContext, authServices.repository);

  await registerHealthRoutes(app, { prisma, env });
  await registerImageRoutes(app, env, storage, authServices.authorizationService, imageRepository);
  await registerGenerationRoutes(
    app,
    storage,
    pipeline.store,
    pipeline.runner,
    authServices.authorizationService,
    imageRepository,
    persistence ?? undefined,
    jobs?.jobService,
    prisma,
  );
  await registerRepairRoutes(
    app,
    pipeline.store,
    pipeline.runner,
    authServices.authorizationService,
    jobs?.jobService,
  );
  await registerExportRoutes(
    app,
    pipeline.store,
    exportService,
    authServices.authorizationService,
    jobs?.jobService,
    persistence ?? undefined,
  );
  await registerEditRoutes(
    app,
    pipeline.store,
    editService,
    authServices.authorizationService,
    jobs?.jobService,
    persistence ?? undefined,
  );
  await registerVersionRoutes(
    app,
    pipeline.store,
    editService,
    authServices.authorizationService,
    persistence ?? undefined,
  );
  await registerVisualComparisonRoutes(
    app,
    pipeline.store,
    visualComparisonService,
    authServices.authorizationService,
    jobs?.jobService,
    persistence ?? undefined,
  );

  if (jobs) {
    await registerJobRoutes(app, jobs.jobService, authServices.authorizationService);
  }

  if (usageService && persistence) {
    await registerUsageRoutes(app, usageService, authServices.authorizationService, env);
    void safeRecoverExpiredReservations(usageService.repository, (event, fields) => {
      app.log.info({ event, ...fields });
    });
  }

  return { app, persistence, authServices, jobs, usageService, prisma, env, paths };
}
