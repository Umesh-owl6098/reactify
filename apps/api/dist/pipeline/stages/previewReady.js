export const previewReadyStage = async (input) => {
    const state = input;
    if (!state.generatedProject || !state.designAnalysis || !state.generationPlan) {
        return {
            status: "failed",
            errorCode: "INTERNAL_ERROR",
            errorMessage: "Pipeline outputs are incomplete at preview_ready.",
            durationMs: 0,
        };
    }
    return {
        status: "completed",
        durationMs: 0,
    };
};
//# sourceMappingURL=previewReady.js.map