import { designAnalysisFixture } from "@reactify/test-utils";
import type { StageResult } from "@reactify/shared";
import type { StageExecutor } from "@reactify/shared";

export const designAnalysisStage: StageExecutor = async () => {
  return {
    status: "completed",
    output: {
      designAnalysis: designAnalysisFixture,
    },
    durationMs: 0,
  } satisfies StageResult;
};
