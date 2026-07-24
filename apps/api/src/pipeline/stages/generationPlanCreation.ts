import { generationPlanFixture } from "@reactify/test-utils";
import type { StageResult } from "@reactify/shared";
import type { StageExecutor } from "@reactify/shared";

export const generationPlanCreationStage: StageExecutor = async () => {
  return {
    status: "completed",
    output: {
      generationPlan: generationPlanFixture,
    },
    durationMs: 0,
  } satisfies StageResult;
};
