import type { StageResult } from "@reactify/shared";
import type { StageExecutor } from "@reactify/shared";

export const sandboxCompilationStage: StageExecutor = async () => {
  return {
    status: "completed",
    durationMs: 0,
  } satisfies StageResult;
};
