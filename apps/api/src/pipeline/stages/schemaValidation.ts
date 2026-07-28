import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { runSchemaProjectValidation } from "../../lib/validation/staticProjectValidator.js";
import { toSafeValidationIssues } from "../../jobs/provider-failure-metadata.js";
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
      providerMetadata: {
        retryable: false,
        validationIssues: toSafeValidationIssues(
          result.errors.map((issue) => ({
            path: issue.filePath ?? "(project)",
            code: issue.code,
            message: issue.message,
          })),
        ),
      },
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
