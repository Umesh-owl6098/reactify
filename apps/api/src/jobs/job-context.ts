import type { GenerationStore } from "../pipeline/store.js";
import type { BackgroundJobType } from "./job-types.js";
import type { JobRepository } from "./job-repository.js";
import type { ProgressReporter } from "./job-progress.js";

export interface JobExecutionContext {
  jobId: string;
  generationId: string;
  ownerId: string;
  workerId: string;
  attemptNumber: number;
  progress: ProgressReporter;
  store: GenerationStore;
  repository: JobRepository;
  isCancelled(): Promise<boolean>;
  ownsLock(): Promise<boolean>;
  assertCanMutate(): Promise<void>;
}

export interface JobHandlerResult {
  result?: Record<string, unknown>;
  waitingForClient?: boolean;
  chainJobs?: Array<{
    jobType: BackgroundJobType;
    payload: Record<string, unknown>;
    idempotencyKey?: string;
  }>;
}

export type JobHandler = (payload: unknown, context: JobExecutionContext) => Promise<JobHandlerResult>;

export interface JobHandlerDeps {
  store: GenerationStore;
  repository: JobRepository;
}
