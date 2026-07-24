import type { StageResult } from "@reactify/shared";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

const ALLOWED_DEPENDENCIES = new Set(["react", "react-dom"]);

export const staticValidationStage: StageExecutor = async (input: unknown) => {
  const state = input as PipelineState;
  const project = state.generatedProject;

  if (!project) {
    return {
      status: "failed",
      errorCode: "GENERATION_SCHEMA_INVALID",
      errorMessage: "Generated project is missing for static validation.",
      durationMs: 0,
    };
  }

  for (const dependency of Object.keys(project.dependencies)) {
    if (!ALLOWED_DEPENDENCIES.has(dependency)) {
      return {
        status: "failed",
        errorCode: "UNSAFE_DEPENDENCY",
        errorMessage: `Dependency "${dependency}" is not allowlisted.`,
        durationMs: 0,
      };
    }
  }

  for (const file of project.files) {
    if (file.path.includes("..") || file.path.startsWith("/")) {
      return {
        status: "failed",
        errorCode: "UNSAFE_PATH",
        errorMessage: `Unsafe file path detected: ${file.path}`,
        durationMs: 0,
      };
    }
  }

  return {
    status: "completed",
    durationMs: 0,
  } satisfies StageResult;
};
