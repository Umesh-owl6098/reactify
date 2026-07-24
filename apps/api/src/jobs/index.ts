import type { PrismaClient } from "@prisma/client";
import type { Env } from "../env.js";
import type { EditService } from "../lib/edit/EditService.js";
import type { ExportService } from "../lib/export/ExportService.js";
import type { VisualComparisonService } from "../lib/visual-comparison/VisualComparisonService.js";
import type { PipelineRunner } from "../pipeline/PipelineRunner.js";
import type { GenerationStore } from "../pipeline/store.js";
import { UsageRepository, createUsageService } from "../usage/index.js";
import { createJobConfig } from "./job-config.js";
import { createJobRegistry } from "./job-registry.js";
import { JobRunner } from "./job-runner.js";
import { JobService } from "./job-service.js";

export interface JobServices {
  jobService: JobService;
  jobRunner: JobRunner;
  usageService: ReturnType<typeof createUsageService>;
}

export function createJobServices(
  prisma: PrismaClient,
  env: Env,
  deps: {
    store: GenerationStore;
    runner: PipelineRunner;
    editService: EditService;
    exportService: ExportService;
    visualComparisonService: VisualComparisonService;
  },
  usageService?: ReturnType<typeof createUsageService>,
  workerPresenceFile?: string,
): JobServices {
  const resolvedUsageService = usageService ?? createUsageService(env, new UsageRepository(prisma));
  const jobService = new JobService(prisma, env, deps.store, resolvedUsageService);
  const config = createJobConfig(env);
  const registry = createJobRegistry(deps);
  const jobRunner = new JobRunner({
    repository: jobService.repository,
    store: deps.store,
    registry,
    config,
    jobService,
    usageService: resolvedUsageService,
    env,
    workerPresenceFile,
    logger: {
      info: (event, fields) => console.info({ event, ...fields }),
      warn: (event, fields) => console.warn({ event, ...fields }),
      error: (event, fields) => console.error({ event, ...fields }),
    },
  });

  if (config.inlineExecution) {
    jobService.setInlineDispatcher((jobId) => jobRunner.executeJobById(jobId));
  }

  return { jobService, jobRunner, usageService: resolvedUsageService };
}

export { JobService } from "./job-service.js";
export { JobRunner } from "./job-runner.js";
