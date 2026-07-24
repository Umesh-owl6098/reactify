import type {
  PlanMetadata,
  ProjectMetadata,
  RepairAttemptRecord,
  RepairStatus,
  SandboxValidationSnapshot,
  SchemaValidationResult,
  StaticValidationResult,
} from "@reactify/generation-contracts";
import type { AIImageInput } from "@reactify/shared";
import type { AllowedImageMimeType } from "@reactify/shared";
import type { GenerationUserStatus } from "@reactify/generation-contracts";

export interface InternalRepairAttemptRecord extends RepairAttemptRecord {
  patchFingerprint?: string;
  diagnosticsFingerprint?: string;
}

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
  projectMetadata?: ProjectMetadata;
  schemaValidation?: SchemaValidationResult;
  staticValidation?: StaticValidationResult;
  projectHash?: string;
  awaitingSandboxValidation?: boolean;
  sandboxValidation?: SandboxValidationSnapshot;
  repairRequired?: boolean;
  repairImplemented?: boolean;
  repairStatus?: RepairStatus;
  currentRepairAttempt?: number;
  repairAttempts?: InternalRepairAttemptRecord[];
  repairInProgress?: boolean;
  manualRetryAllowed?: boolean;
  validationReportFingerprint?: string | null;
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
  project: ProjectMetadata | null;
  schemaValidation: SchemaValidationResult | null;
  staticValidation: StaticValidationResult | null;
  sandboxValidation: SandboxValidationSnapshot | null;
  projectHash: string | null;
  validationReportFingerprint: string | null;
  repairRequired: boolean;
  repairStatus: RepairStatus;
  currentRepairAttempt: number;
  maxRepairAttempts: number;
  repairAttempts: InternalRepairAttemptRecord[];
  repairInProgress: boolean;
  manualRetryAllowed: boolean;
  editedByUser: boolean;
  confirmedAt: string | null;
  awaitingPlanConfirmation: boolean;
  awaitingSandboxValidation: boolean;
  pipelineState: PipelineState | null;
  resumeInProgress: boolean;
  sandboxResumeInProgress: boolean;
  errors: GenerationErrorRecord[];
  cancelled: boolean;
  failStage?: import("@reactify/generation-contracts").PipelineStageName;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationStoreSnapshot extends Omit<
  GenerationRecord,
  | "cancelled"
  | "failStage"
  | "pipelineState"
  | "resumeInProgress"
  | "sandboxResumeInProgress"
  | "validationReportFingerprint"
  | "repairAttempts"
  | "outputs"
> {
  outputs: {
    designAnalysis: import("@reactify/generation-contracts").DesignAnalysisV1 | null;
    generationPlan: import("@reactify/generation-contracts").GenerationPlanV1 | null;
    generatedProject: import("@reactify/generation-contracts").GeneratedProjectSummary | null;
  };
  repair: import("@reactify/generation-contracts").RepairStatusSnapshot | null;
  durations: {
    totalMs: number;
    stages: Record<string, number>;
  };
  featureFlags: {
    enableGenerationPlanEditing: boolean;
  };
}
