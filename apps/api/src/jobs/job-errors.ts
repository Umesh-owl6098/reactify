import { ErrorCode } from "@reactify/shared";

export class JobError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean = false,
    readonly permanent: boolean = false,
  ) {
    super(message);
    this.name = "JobError";
  }
}

export class TransientJobError extends JobError {
  constructor(code: string, message: string) {
    super(code, message, true, false);
    this.name = "TransientJobError";
  }
}

export class PermanentJobError extends JobError {
  constructor(code: string, message: string) {
    super(code, message, false, true);
    this.name = "PermanentJobError";
  }
}

export class JobCancelledError extends JobError {
  constructor(code: string = ErrorCode.JOB_CANCELLED, message = "Job was cancelled.") {
    super(code, message, false, true);
    this.name = "JobCancelledError";
  }
}

export function isTransientError(error: unknown): boolean {
  if (error instanceof TransientJobError) {
    return true;
  }
  if (error instanceof PermanentJobError || error instanceof JobCancelledError) {
    return false;
  }
  if (error instanceof JobError) {
    return error.retryable;
  }
  return false;
}

export function classifyProviderError(error: unknown): JobError {
  if (error instanceof JobError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const lower = message.toLowerCase();

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new TransientJobError(ErrorCode.AI_TIMEOUT, "AI request timed out.");
  }

  if (lower.includes("rate limit") || lower.includes("429")) {
    return new TransientJobError(ErrorCode.RATE_LIMITED, "AI provider rate limit reached.");
  }

  if (lower.includes("connection") || lower.includes("econnreset") || lower.includes("network")) {
    return new TransientJobError(ErrorCode.DATABASE_UNAVAILABLE, "Temporary connection failure.");
  }

  return new PermanentJobError(ErrorCode.INTERNAL_ERROR, "An unexpected error occurred.");
}
