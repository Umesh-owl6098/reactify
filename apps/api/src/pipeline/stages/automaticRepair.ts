import { ErrorCode, type StageExecutor } from "@reactify/shared";
import type { PipelineState } from "../types.js";

export const automaticRepairStage: StageExecutor = async (input) => {
  const state = input as PipelineState;
  const sandbox = state.sandboxValidation;

  if (!sandbox) {
    return {
      status: "failed",
      errorCode: ErrorCode.RUNTIME_VALIDATION_FAILED,
      errorMessage: "Automatic repair requires sandbox validation results.",
      durationMs: 0,
    };
  }

  const compilationOk = sandbox.compilation.success;
  const runtimeOk = sandbox.runtime.success;

  if (compilationOk && runtimeOk) {
    return {
      status: "completed",
      output: {
        repairRequired: false,
        repairImplemented: false,
      },
      durationMs: 0,
    };
  }

  return {
    status: "completed",
    output: {
      repairRequired: true,
      repairImplemented: false,
    },
    durationMs: 0,
  };
};
