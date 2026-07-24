/**
 * Runtime validation is completed from the browser-assisted sandbox report.
 * If validation results are already present, this stage is a no-op resume step.
 */
import { ErrorCode, type StageExecutor } from "@reactify/shared";
import type { PipelineState } from "../types.js";

export const runtimeValidationStage: StageExecutor = async (input) => {
  const state = input as PipelineState;

  if (state.sandboxValidation) {
    return {
      status: state.sandboxValidation.runtime.success ? "completed" : "failed",
      durationMs: state.sandboxValidation.runtime.durationMs,
      errorCode: state.sandboxValidation.runtime.success
        ? undefined
        : ErrorCode.RUNTIME_VALIDATION_FAILED,
      errorMessage: state.sandboxValidation.runtime.success
        ? undefined
        : "Browser-assisted runtime validation failed.",
    };
  }

  if (state.awaitingSandboxValidation) {
    return {
      status: "paused",
      durationMs: 0,
    };
  }

  return {
    status: "failed",
    errorCode: ErrorCode.RUNTIME_VALIDATION_FAILED,
    errorMessage: "Runtime validation results are missing.",
    durationMs: 0,
  };
};
