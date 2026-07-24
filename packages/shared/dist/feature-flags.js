export const DEFAULT_FEATURE_FLAGS = {
    enableRepair: true,
    enableInspector: true,
    enableAccessibility: true,
    enableGenerationPlanEditing: true,
};
export const USER_VISIBLE_STATUSES = [
    "Queued",
    "Uploading",
    "Analyzing",
    "Planning",
    "Generating",
    "Validating",
    "Compiling",
    "Repairing",
    "Ready",
    "Failed",
    "Cancelled",
];
export function deriveUserStatus(activeStage, terminalStatus) {
    if (terminalStatus) {
        return terminalStatus;
    }
    if (!activeStage) {
        return "Queued";
    }
    return STAGE_TO_USER_STATUS[activeStage];
}
const STAGE_TO_USER_STATUS = {
    upload_validation: "Uploading",
    image_preparation: "Uploading",
    design_analysis: "Analyzing",
    generation_plan_creation: "Planning",
    generation_plan_review: "Planning",
    react_project_generation: "Generating",
    schema_validation: "Validating",
    static_validation: "Validating",
    sandbox_compilation: "Compiling",
    runtime_validation: "Compiling",
    automatic_repair: "Repairing",
    preview_ready: "Ready",
};
//# sourceMappingURL=feature-flags.js.map