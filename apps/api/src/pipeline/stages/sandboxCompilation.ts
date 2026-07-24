/**
 * Browser-assisted sandbox compilation.
 *
 * Sandpack runs in the user's browser, so the backend cannot compile generated
 * projects directly. After static validation succeeds, this stage pauses the
 * pipeline and waits for a client validation report via
 * POST /api/v1/generations/:id/sandbox-validation.
 */
import { ErrorCode, type StageExecutor } from "@reactify/shared";
import { computeProjectHash } from "../../lib/projectHash.js";
import type { PipelineState } from "../types.js";

export const sandboxCompilationStage: StageExecutor = async (input) => {
  const state = input as PipelineState;

  if (!state.generatedProject) {
    return {
      status: "failed",
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      errorMessage: "Generated project is missing before sandbox compilation.",
      durationMs: 0,
    };
  }

  const projectHash = computeProjectHash(state.generatedProject);

  return {
    status: "paused",
    output: {
      projectHash,
      awaitingSandboxValidation: true,
    },
    durationMs: 0,
  };
};
