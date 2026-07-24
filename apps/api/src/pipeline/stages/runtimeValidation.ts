import type { StageResult } from "@reactify/shared";
import type { StageExecutor } from "@reactify/shared";

export const runtimeValidationStage: StageExecutor = async () => {
  return {
    status: "completed",
    durationMs: 0,
  } satisfies StageResult;
};
