import type { StageResult } from "@reactify/shared";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

export const generationPlanReviewStage: StageExecutor = async (input: unknown) => {
  const state = input as PipelineState;

  if (!state.generationPlan) {
    return {
      status: "failed",
      errorCode: "PLAN_SCHEMA_INVALID",
      errorMessage: "Generation plan is missing before review.",
      durationMs: 0,
    };
  }

  return {
    status: "completed",
    output: {
      planConfirmed: true,
    },
    durationMs: 0,
  } satisfies StageResult<Partial<PipelineState>>;
};
