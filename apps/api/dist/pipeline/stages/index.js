import { automaticRepairStage } from "./automaticRepair.js";
import { designAnalysisStage } from "./designAnalysis.js";
import { generationPlanCreationStage } from "./generationPlanCreation.js";
import { generationPlanReviewStage } from "./generationPlanReview.js";
import { createImagePreparationStage } from "./imagePreparation.js";
import { previewReadyStage } from "./previewReady.js";
import { reactProjectGenerationStage } from "./reactProjectGeneration.js";
import { runtimeValidationStage } from "./runtimeValidation.js";
import { sandboxCompilationStage } from "./sandboxCompilation.js";
import { schemaValidationStage } from "./schemaValidation.js";
import { staticValidationStage } from "./staticValidation.js";
import { createUploadValidationStage } from "./uploadValidation.js";
export function createStageExecutors(imageStorage) {
    return {
        upload_validation: createUploadValidationStage(imageStorage),
        image_preparation: createImagePreparationStage(imageStorage),
        design_analysis: designAnalysisStage,
        generation_plan_creation: generationPlanCreationStage,
        generation_plan_review: generationPlanReviewStage,
        react_project_generation: reactProjectGenerationStage,
        schema_validation: schemaValidationStage,
        static_validation: staticValidationStage,
        sandbox_compilation: sandboxCompilationStage,
        runtime_validation: runtimeValidationStage,
        automatic_repair: automaticRepairStage,
        preview_ready: previewReadyStage,
    };
}
//# sourceMappingURL=index.js.map