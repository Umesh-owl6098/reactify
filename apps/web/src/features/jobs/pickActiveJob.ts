import type { JobStatusResponse } from "@reactify/shared";

const TERMINAL_GENERATION_STATUSES = new Set(["Ready", "Failed", "Cancelled"]);
const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "cancelled", "dead_letter"]);
const ACTIVE_JOB_STATUSES = new Set(["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"]);

export interface PickActiveJobContext {
  status: string;
  awaitingPlanConfirmation?: boolean;
  awaitingSandboxValidation?: boolean;
}

function pickFromStatuses(jobs: JobStatusResponse[], statuses: string[]): JobStatusResponse | null {
  for (const status of statuses) {
    const match = jobs.find((job) => job.status === status);
    if (match) {
      return match;
    }
  }
  return null;
}

export function pickActiveJob(
  jobs: JobStatusResponse[],
  generation?: PickActiveJobContext | null,
): JobStatusResponse | null {
  const relevantJobs = jobs.filter((job) => ACTIVE_JOB_STATUSES.has(job.status));

  if (!generation || TERMINAL_GENERATION_STATUSES.has(generation.status)) {
    return null;
  }

  if (generation.awaitingPlanConfirmation) {
    return (
      relevantJobs.find(
        (job) => job.jobType === "generation_plan_creation" && job.status === "waiting_for_client",
      ) ??
      pickFromStatuses(
        relevantJobs,
        ["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"],
      )
    );
  }

  if (generation.awaitingSandboxValidation) {
    return (
      relevantJobs.find(
        (job) => job.jobType === "react_project_generation" && job.status === "waiting_for_client",
      ) ??
      pickFromStatuses(
        relevantJobs,
        ["queued", "claimed", "running", "retry_scheduled", "waiting_for_client"],
      )
    );
  }

  return (
    pickFromStatuses(relevantJobs, ["queued", "claimed", "running", "retry_scheduled"]) ??
    pickFromStatuses(relevantJobs, ["waiting_for_client"]) ??
    relevantJobs.find((job) => ["failed", "dead_letter"].includes(job.status)) ??
    null
  );
}

export function isStaleJobForGeneration(
  job: JobStatusResponse,
  generation: PickActiveJobContext,
): boolean {
  if (TERMINAL_GENERATION_STATUSES.has(generation.status)) {
    return true;
  }

  if (TERMINAL_JOB_STATUSES.has(job.status)) {
    return generation.status === "Analyzing" && job.jobType === "design_analysis"
      ? false
      : job.status !== "waiting_for_client";
  }

  return false;
}
