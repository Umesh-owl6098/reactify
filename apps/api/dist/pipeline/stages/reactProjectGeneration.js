import { generatedProjectFixture } from "@reactify/test-utils";
export const reactProjectGenerationStage = async (input) => {
    const state = input;
    if (!state.planConfirmed) {
        return {
            status: "failed",
            errorCode: "PLAN_SCHEMA_INVALID",
            errorMessage: "Generation plan must be confirmed before code generation.",
            durationMs: 0,
        };
    }
    return {
        status: "completed",
        output: {
            generatedProject: generatedProjectFixture,
        },
        durationMs: 0,
    };
};
//# sourceMappingURL=reactProjectGeneration.js.map