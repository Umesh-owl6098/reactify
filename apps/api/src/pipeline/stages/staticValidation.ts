import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { runStaticProjectValidationAsync } from "../../lib/validation/staticProjectValidator.js";
import { toSafeValidationIssues } from "../../jobs/provider-failure-metadata.js";
import type { PipelineState } from "../types.js";

export const staticValidationStage: StageExecutor = async (input) => {
  const state = input as PipelineState;

  if (!state.generatedProject) {
    return {
      status: "failed",
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      errorMessage: "Generated project is missing for static validation.",
      durationMs: 0,
    };
  }

  const result = await runStaticProjectValidationAsync(state.generatedProject, state.generationPlan);
  const output = {
    staticValidation: result,
  };

  if (!result.valid) {
    const firstError = result.errors[0];
    const errorCode =
      firstError?.code === "UNSAFE_DEPENDENCY"
        ? ErrorCode.UNSAFE_DEPENDENCY
        : firstError?.code === "PLAN_PROJECT_MISMATCH"
          ? ErrorCode.PLAN_PROJECT_MISMATCH
          : firstError?.code === "UNSAFE_FILE_PATH"
            ? ErrorCode.UNSAFE_FILE_PATH
            : firstError?.code === "EVAL" ||
                firstError?.code === "NEW_FUNCTION" ||
                firstError?.code === "DANGEROUSLY_SET_INNER_HTML"
              ? ErrorCode.UNSAFE_SOURCE_CODE
              : ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID;

    return {
      status: "failed",
      errorCode,
      errorMessage: firstError?.message ?? "Generated project failed static validation.",
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
