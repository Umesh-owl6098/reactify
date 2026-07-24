import { generatedProjectFixture } from "@reactify/test-utils";
import type { StageResult } from "@reactify/shared";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

export const reactProjectGenerationStage: StageExecutor = async (input: unknown) => {
  const state = input as PipelineState;

  if (!state.planConfirmed) {
    return {
      status: "failed",
      errorCode: "PLAN_SCHEMA_INVALID",
      errorMessage: "Generation plan must be confirmed before code generation.",
      durationMs: 0,
    };
  }

  return {
    status: "completed",
    output: {
      generatedProject: generatedProjectFixture,
    },
    durationMs: 0,
  } satisfies StageResult<Partial<PipelineState>>;
};
