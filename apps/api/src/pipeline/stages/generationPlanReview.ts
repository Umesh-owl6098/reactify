import type { StageExecutor } from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
import type { PipelineState } from "../types.js";

export const generationPlanReviewStage: StageExecutor = async (input) => {
  const state = input as PipelineState;

  if (!state.generationPlan) {
    return {
      status: "failed",
      errorCode: ErrorCode.PLAN_SCHEMA_INVALID,
      errorMessage: "Generation plan is missing before review.",
      durationMs: 0,
    };
  }

  return {
    status: "paused",
    output: {
      awaitingPlanConfirmation: true,
    },
    durationMs: 0,
  };
};
