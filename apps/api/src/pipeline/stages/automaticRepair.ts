import type { StageResult } from "@reactify/shared";
import type { StageExecutor } from "@reactify/shared";

export const automaticRepairStage: StageExecutor = async () => {
  return {
    status: "skipped",
    durationMs: 0,
  } satisfies StageResult;
};
