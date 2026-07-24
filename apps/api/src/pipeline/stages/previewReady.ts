import type { StageResult } from "@reactify/shared";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

export const previewReadyStage: StageExecutor = async (input: unknown) => {
  const state = input as PipelineState;

  if (!state.generatedProject || !state.designAnalysis || !state.generationPlan) {
    return {
      status: "failed",
      errorCode: "INTERNAL_ERROR",
      errorMessage: "Pipeline outputs are incomplete at preview_ready.",
      durationMs: 0,
    };
  }

  return {
    status: "completed",
    durationMs: 0,
  } satisfies StageResult;
};
