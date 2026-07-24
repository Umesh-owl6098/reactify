export const generationPlanReviewStage = async (input) => {
    const state = input;
    if (!state.generationPlan) {
        return {
            status: "failed",
            errorCode: "PLAN_SCHEMA_INVALID",
            errorMessage: "Generation plan is missing before review.",
            durationMs: 0,
        };
    }
    return {
        status: "completed",
        output: {
            planConfirmed: true,
        },
        durationMs: 0,
    };
};
//# sourceMappingURL=generationPlanReview.js.map