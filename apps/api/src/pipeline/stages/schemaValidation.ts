import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { runSchemaProjectValidation } from "../../lib/validation/staticProjectValidator.js";
import type { PipelineState } from "../types.js";

export const schemaValidationStage: StageExecutor = async (input) => {
  const state = input as PipelineState;

  if (!state.generatedProject) {
    return {
      status: "failed",
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      errorMessage: "Generated project is missing for schema validation.",
      durationMs: 0,
    };
  }

  const result = runSchemaProjectValidation(state.generatedProject);
  const output = {
    schemaValidation: result,
  };

  if (!result.valid) {
    return {
      status: "failed",
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      errorMessage: result.errors[0]?.message ?? "Generated project failed schema validation.",
      output,
      durationMs: 0,
    } satisfies StageResult<Partial<PipelineState>>;
  }

  return {
    status: "completed",
    output,
    durationMs: 0,
  } satisfies StageResult<Partial<PipelineState>>;
};
