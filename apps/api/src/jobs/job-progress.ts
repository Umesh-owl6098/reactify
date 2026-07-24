import type { JobRepository } from "./job-repository.js";

export interface ProgressReporter {
  report(progress: number, message: string): Promise<void>;
}

export function createProgressReporter(
  repository: JobRepository,
  jobId: string,
  workerId: string,
  minIntervalMs = 500,
): ProgressReporter {
  let lastProgress = -1;
  let lastReportAt = 0;

  return {
    async report(progress: number, message: string): Promise<void> {
      const clamped = Math.max(0, Math.min(100, Math.floor(progress)));
      const now = Date.now();
      if (clamped <= lastProgress && now - lastReportAt < minIntervalMs) {
        return;
      }
      if (clamped === lastProgress && message === "") {
        return;
      }

      lastProgress = clamped;
      lastReportAt = now;
      await repository.updateProgress(jobId, workerId, clamped, message);
    },
  };
}

export const DesignAnalysisProgress = {
  VALIDATING: { progress: 5, message: "Validating input" },
  LOADING_IMAGE: { progress: 15, message: "Loading image" },
  PREPARING: { progress: 30, message: "Preparing AI request" },
  ANALYZING: { progress: 60, message: "Analyzing your screenshot" },
  VALIDATING_RESPONSE: { progress: 85, message: "Validating response" },
  COMPLETED: { progress: 100, message: "Completed" },
} as const;

export const ProjectGenerationProgress = {
  LOADING_PLAN: { progress: 10, message: "Creating the implementation plan" },
  PREPARING: { progress: 25, message: "Preparing prompt" },
  GENERATING: { progress: 55, message: "Generating React components" },
  VALIDATING_SCHEMA: { progress: 75, message: "Validating generated files" },
  STATIC_VALIDATION: { progress: 90, message: "Running static validation" },
  COMPLETED: { progress: 100, message: "Completed" },
} as const;

export const ExportProgress = {
  VALIDATING: { progress: 15, message: "Validating project" },
  README: { progress: 35, message: "Generating README" },
  MANIFEST: { progress: 55, message: "Generating manifest" },
  ZIP: { progress: 80, message: "Preparing ZIP export" },
  COMPLETED: { progress: 100, message: "Ready" },
} as const;
