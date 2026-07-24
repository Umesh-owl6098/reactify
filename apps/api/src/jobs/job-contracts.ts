import type { z } from "zod";
import {
  AutomaticRepairJobPayloadSchema,
  DesignAnalysisJobPayloadSchema,
  EditIntentAnalysisJobPayloadSchema,
  ExportPreparationJobPayloadSchema,
  GenerationPlanJobPayloadSchema,
  ProjectEditGenerationJobPayloadSchema,
  ReactProjectGenerationJobPayloadSchema,
  VisualCorrectionJobPayloadSchema,
  type BackgroundJobType,
} from "@reactify/shared";
import { PermanentJobError } from "./job-errors.js";
import { ErrorCode } from "@reactify/shared";

const payloadSchemas: Record<BackgroundJobType, z.ZodTypeAny> = {
  design_analysis: DesignAnalysisJobPayloadSchema,
  generation_plan_creation: GenerationPlanJobPayloadSchema,
  react_project_generation: ReactProjectGenerationJobPayloadSchema,
  automatic_repair: AutomaticRepairJobPayloadSchema,
  edit_intent_analysis: EditIntentAnalysisJobPayloadSchema,
  project_edit_generation: ProjectEditGenerationJobPayloadSchema,
  visual_correction: VisualCorrectionJobPayloadSchema,
  export_preparation: ExportPreparationJobPayloadSchema,
};

export function validateJobPayload(jobType: BackgroundJobType, payload: import("@prisma/client").Prisma.JsonValue): unknown {
  const schema = payloadSchemas[jobType];
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new PermanentJobError(ErrorCode.PERSISTED_DATA_INVALID, "Job payload failed validation.");
  }
  return result.data;
}

export function validateJobPayloadForEnqueue(
  jobType: BackgroundJobType,
  payload: unknown,
): import("@prisma/client").Prisma.InputJsonValue {
  const schema = payloadSchemas[jobType];
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new PermanentJobError(ErrorCode.PERSISTED_DATA_INVALID, "Invalid job payload.");
  }
  return result.data as import("@prisma/client").Prisma.InputJsonValue;
}
