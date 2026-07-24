import type { PlanMetadata } from "@reactify/generation-contracts";
import type { AIImageInput } from "@reactify/shared";
import type { AllowedImageMimeType } from "@reactify/shared";
import type { GenerationUserStatus } from "@reactify/generation-contracts";

export interface PipelineState {
  imageId: string;
  imageMimeType?: AllowedImageMimeType;
  imageSizeBytes?: number;
  imageBase64?: string;
  imageInput?: AIImageInput;
  designAnalysis?: import("@reactify/generation-contracts").DesignAnalysisV1;
  generationPlan?: import("@reactify/generation-contracts").GenerationPlanV1;
  generatedProject?: import("@reactify/generation-contracts").GeneratedProjectV1;
  planConfirmed?: boolean;
  analysisMetadata?: import("@reactify/generation-contracts").AnalysisMetadata;
  planMetadata?: PlanMetadata;
}

export interface GenerationErrorRecord {
  stage: import("@reactify/generation-contracts").PipelineStageName;
  code: string;
  message: string;
}

export interface GenerationRecord {
  id: string;
  imageId: string;
  projectId: string;
  status: GenerationUserStatus;
  activeStage: import("@reactify/generation-contracts").PipelineStageName | null;
  stages: import("@reactify/generation-contracts").PipelineStageLogEntry[];
  outputs: {
    designAnalysis: import("@reactify/generation-contracts").DesignAnalysisV1 | null;
    generationPlan: import("@reactify/generation-contracts").GenerationPlanV1 | null;
    generatedProject: import("@reactify/generation-contracts").GeneratedProjectV1 | null;
  };
  analysis: import("@reactify/generation-contracts").AnalysisMetadata | null;
  plan: PlanMetadata | null;
  editedByUser: boolean;
  confirmedAt: string | null;
  awaitingPlanConfirmation: boolean;
  pipelineState: PipelineState | null;
  resumeInProgress: boolean;
  errors: GenerationErrorRecord[];
  cancelled: boolean;
  failStage?: import("@reactify/generation-contracts").PipelineStageName;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationStoreSnapshot extends Omit<
  GenerationRecord,
  "cancelled" | "failStage" | "pipelineState" | "resumeInProgress"
> {
  durations: {
    totalMs: number;
    stages: Record<string, number>;
  };
  featureFlags: {
    enableGenerationPlanEditing: boolean;
  };
}
