import type { Env } from "../env.js";
import type { BackgroundJobType } from "./job-types.js";

export interface JobConfig {
  pollIntervalMs: number;
  lockTtlMs: number;
  heartbeatIntervalMs: number;
  shutdownGraceMs: number;
  defaultMaxAttempts: number;
  exportMaxAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  batchSize: number;
  workerConcurrency: number;
  inlineExecution: boolean;
  staleRecoveryIntervalMs: number;
  staleGenerationThresholdMs: number;
  jobMissingGraceMs: number;
}

export function createJobConfig(env: Env): JobConfig {
  return {
    pollIntervalMs: env.JOB_WORKER_POLL_INTERVAL_MS,
    lockTtlMs: env.JOB_LOCK_TTL_MS,
    heartbeatIntervalMs: env.JOB_HEARTBEAT_INTERVAL_MS,
    shutdownGraceMs: env.JOB_SHUTDOWN_GRACE_MS,
    defaultMaxAttempts: env.JOB_DEFAULT_MAX_ATTEMPTS,
    exportMaxAttempts: env.JOB_EXPORT_MAX_ATTEMPTS,
    retryBaseDelayMs: env.JOB_RETRY_BASE_DELAY_MS,
    retryMaxDelayMs: env.JOB_RETRY_MAX_DELAY_MS,
    batchSize: env.JOB_BATCH_SIZE,
    workerConcurrency: env.WORKER_CONCURRENCY,
    inlineExecution: env.JOB_INLINE_EXECUTION,
    staleRecoveryIntervalMs: env.JOB_STALE_RECOVERY_INTERVAL_MS,
    staleGenerationThresholdMs: env.JOB_STALE_GENERATION_THRESHOLD_MS,
    jobMissingGraceMs: env.JOB_MISSING_GRACE_MS,
  };
}

export function maxAttemptsForJobType(config: JobConfig, jobType: BackgroundJobType): number {
  if (jobType === "export_preparation") {
    return config.exportMaxAttempts;
  }
  return config.defaultMaxAttempts;
}

export function computeRetryDelayMs(config: JobConfig, attemptNumber: number): number {
  const base = config.retryBaseDelayMs;
  const exponential = base * 4 ** Math.max(0, attemptNumber - 1);
  const capped = Math.min(exponential, config.retryMaxDelayMs);
  const jitter = Math.floor(Math.random() * Math.min(1000, capped * 0.1));
  return capped + jitter;
}
