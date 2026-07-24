import type { PipelineRunner } from "../pipeline/PipelineRunner.js";
import type { EditService } from "../lib/edit/EditService.js";
import type { ExportService } from "../lib/export/ExportService.js";
import type { VisualComparisonService } from "../lib/visual-comparison/VisualComparisonService.js";
import type { BackgroundJobType } from "./job-types.js";
import type { JobHandler } from "./job-context.js";
import { createAutomaticRepairHandler } from "./handlers/automatic-repair-job.js";
import { createDesignAnalysisHandler } from "./handlers/design-analysis-job.js";
import { createEditIntentHandler } from "./handlers/edit-intent-job.js";
import { createExportPreparationHandler } from "./handlers/export-preparation-job.js";
import { createGenerationPlanHandler } from "./handlers/generation-plan-job.js";
import { createProjectEditHandler } from "./handlers/project-edit-job.js";
import { createReactProjectGenerationHandler } from "./handlers/react-project-generation-job.js";
import { createVisualCorrectionHandler } from "./handlers/visual-correction-job.js";

export interface JobRegistryDeps {
  runner: PipelineRunner;
  editService: EditService;
  exportService: ExportService;
  visualComparisonService: VisualComparisonService;
}

export function createJobRegistry(deps: JobRegistryDeps): Map<BackgroundJobType, JobHandler> {
  return new Map<BackgroundJobType, JobHandler>([
    ["design_analysis", createDesignAnalysisHandler(deps.runner)],
    ["generation_plan_creation", createGenerationPlanHandler(deps.runner)],
    ["react_project_generation", createReactProjectGenerationHandler(deps.runner)],
    ["automatic_repair", createAutomaticRepairHandler(deps.runner)],
    ["edit_intent_analysis", createEditIntentHandler(deps.editService)],
    ["project_edit_generation", createProjectEditHandler(deps.editService)],
    ["visual_correction", createVisualCorrectionHandler(deps.visualComparisonService)],
    ["export_preparation", createExportPreparationHandler(deps.exportService)],
  ]);
}
