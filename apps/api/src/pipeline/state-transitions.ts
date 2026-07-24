import type { GenerationUserStatus } from "@reactify/generation-contracts";
import type { BackgroundJobStatus } from "../jobs/job-types.js";

const TERMINAL_GENERATION_STATUSES = new Set<GenerationUserStatus>([
  "Ready",
  "Failed",
  "Cancelled",
]);

const TERMINAL_JOB_STATUSES = new Set<BackgroundJobStatus>([
  "completed",
  "failed",
  "cancelled",
  "dead_letter",
]);

const ALLOWED_STATUS_TRANSITIONS: Partial<Record<GenerationUserStatus, GenerationUserStatus[]>> = {
  Queued: ["Analyzing", "Failed", "Cancelled"],
  Analyzing: ["Planning", "Failed", "Cancelled"],
  Planning: ["Generating", "Failed", "Cancelled"],
  Generating: ["Validating", "Failed", "Cancelled"],
  Validating: ["Compiling", "RepairRequired", "Failed", "Cancelled"],
  Compiling: ["Ready", "RepairRequired", "Failed", "Cancelled"],
  Repairing: ["Validating", "Compiling", "Ready", "RepairFailed", "Failed", "Cancelled"],
  RepairRequired: ["Repairing", "Failed", "Cancelled"],
  RepairFailed: ["Repairing", "Failed", "Cancelled", "Ready"],
};

export function isTerminalGenerationStatus(status: GenerationUserStatus): boolean {
  return TERMINAL_GENERATION_STATUSES.has(status);
}

export function isTerminalJobStatus(status: BackgroundJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isAllowedGenerationStatusTransition(
  from: GenerationUserStatus,
  to: GenerationUserStatus,
): boolean {
  if (from === to) {
    return true;
  }

  if (TERMINAL_GENERATION_STATUSES.has(from)) {
    return false;
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

export function assertAllowedGenerationStatusTransition(
  from: GenerationUserStatus,
  to: GenerationUserStatus,
): void {
  if (!isAllowedGenerationStatusTransition(from, to)) {
    throw new Error(`Invalid generation status transition: ${from} -> ${to}`);
  }
}

export interface GenerationJobConsistencyInput {
  generationStatus: GenerationUserStatus;
  awaitingPlanConfirmation: boolean;
  awaitingSandboxValidation: boolean;
  jobStatus: BackgroundJobStatus | null;
}

export function detectGenerationJobInconsistency(
  input: GenerationJobConsistencyInput,
): string | null {
  if (isTerminalGenerationStatus(input.generationStatus)) {
    return null;
  }

  if (input.awaitingPlanConfirmation || input.awaitingSandboxValidation) {
    return null;
  }

  if (!input.jobStatus) {
    if (["Analyzing", "Planning", "Generating", "Repairing"].includes(input.generationStatus)) {
      return "JOB_NOT_FOUND";
    }
    return null;
  }

  if (TERMINAL_JOB_STATUSES.has(input.jobStatus) && !isTerminalGenerationStatus(input.generationStatus)) {
    return input.jobStatus === "cancelled" ? "JOB_CANCELLED" : "JOB_STALLED";
  }

  return null;
}
