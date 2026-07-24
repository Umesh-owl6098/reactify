import { GeneratedProjectV1Schema } from "@reactify/generation-contracts";
import { DesignAnalysisV1Schema } from "@reactify/generation-contracts";
import { GenerationPlanV1Schema } from "@reactify/generation-contracts";
import type { StageResult } from "@reactify/shared";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

export const schemaValidationStage: StageExecutor = async (input: unknown) => {
  const state = input as PipelineState;

  try {
    if (state.designAnalysis) {
      DesignAnalysisV1Schema.parse(state.designAnalysis);
    }
    if (state.generationPlan) {
      GenerationPlanV1Schema.parse(state.generationPlan);
    }
    if (state.generatedProject) {
      GeneratedProjectV1Schema.parse(state.generatedProject);
    }
  } catch {
    return {
      status: "failed",
      errorCode: "GENERATION_SCHEMA_INVALID",
      errorMessage: "One or more pipeline contracts failed schema validation.",
      durationMs: 0,
    };
  }

  return {
    status: "completed",
    durationMs: 0,
  } satisfies StageResult;
};
