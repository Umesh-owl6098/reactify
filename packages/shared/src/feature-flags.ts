import type { PipelineStageName } from "@reactify/generation-contracts";
import type { GenerationUserStatus } from "@reactify/generation-contracts";

export interface FeatureFlags {
  enableRepair: boolean;
  enableInspector: boolean;
  enableAccessibility: boolean;
  enableGenerationPlanEditing: boolean;
}

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableRepair: true,
  enableInspector: true,
  enableAccessibility: true,
  enableGenerationPlanEditing: true,
};

export const USER_VISIBLE_STATUSES: GenerationUserStatus[] = [
  "Queued",
  "Uploading",
  "Analyzing",
  "Planning",
  "Generating",
  "Validating",
  "Compiling",
  "Repairing",
  "RepairRequired",
  "RepairFailed",
  "Ready",
  "Failed",
  "Cancelled",
];

export function deriveUserStatus(
  activeStage: PipelineStageName | null,
  terminalStatus?: GenerationUserStatus,
): GenerationUserStatus {
  if (terminalStatus) {
    return terminalStatus;
  }

  if (!activeStage) {
    return "Queued";
  }

  return STAGE_TO_USER_STATUS[activeStage];
}

const STAGE_TO_USER_STATUS: Record<PipelineStageName, GenerationUserStatus> = {
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
