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

export interface ProjectVersionRecord {
  versionId: string;
  versionNumber: number;
  source: import("@reactify/generation-contracts").ProjectVersionSource;
  label: string;
  parentVersionId: string | null;
  projectHash: string;
  project: import("@reactify/generation-contracts").GeneratedProjectV1;
  changedFiles: string[];
  editId?: string;
  instruction?: string;
  createdAt: string;
}

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
  visualFidelity?: import("../lib/visual-fidelity/visualFidelityValidator.js").VisualFidelityReport | null;
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
  ownerId: string;
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
  exports: import("../lib/export/ExportService.js").InternalExportRecord[];
  exportInProgress: boolean;
  versions: ProjectVersionRecord[];
  activeVersionId: string | null;
  edits: import("../lib/edit/EditService.js").InternalEditRecord[];
  editInProgress: boolean;
  activeEditId: string | null;
  rollbackInProgress: boolean;
  visualComparisons: import("../lib/visual-comparison/VisualComparisonService.js").InternalVisualComparisonRecord[];
  visualComparisonInProgress: boolean;
  activeComparisonId: string | null;
  visualCorrectionInProgress: boolean;
  visualCorrectionAttempt: number;
  visualCorrectionMaxAttempts: number;
  previewCaptureRequired: boolean;
  pendingVisualRecomparison: {
    parentComparisonId: string;
    baselineSimilarityScore: number;
    versionId: string;
    viewport: { width: number; height: number; deviceScaleFactor: number };
  } | null;
  stateVersion?: number;
  deletedAt?: string | null;
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
  | "exports"
  | "versions"
  | "edits"
  | "editInProgress"
  | "rollbackInProgress"
  | "visualComparisons"
  | "visualComparisonInProgress"
  | "visualCorrectionInProgress"
  | "visualCorrectionAttempt"
  | "visualCorrectionMaxAttempts"
  | "previewCaptureRequired"
  | "pendingVisualRecomparison"
> {
  outputs: {
    designAnalysis: import("@reactify/generation-contracts").DesignAnalysisV1 | null;
    generationPlan: import("@reactify/generation-contracts").GenerationPlanV1 | null;
    generatedProject: import("@reactify/generation-contracts").GeneratedProjectSummary | null;
  };
  repair: import("@reactify/generation-contracts").RepairStatusSnapshot | null;
  exportAllowed: boolean;
  exportBlockedReason: import("@reactify/generation-contracts").ExportBlockedReason | null;
  latestExportSummary: import("@reactify/generation-contracts").ExportSummary | null;
  editAllowed: boolean;
  editBlockedReason: import("@reactify/generation-contracts").EditBlockedReason | null;
  activeEditId: string | null;
  activeEditStatus: import("@reactify/generation-contracts").EditOperationSummary["status"] | null;
  clarificationRequired: boolean;
  clarificationQuestion: string | null;
  latestEditSummary: import("@reactify/generation-contracts").EditOperationSummary | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  sandboxRevalidationRequired: boolean;
  visualComparisonAllowed: boolean;
  visualComparisonBlockedReason: import("@reactify/generation-contracts").VisualComparisonBlockedReason | null;
  activeComparisonId: string | null;
  activeComparisonStatus: import("@reactify/generation-contracts").VisualComparisonStatus | null;
  latestSimilarityScore: number | null;
  latestDifferencePercentage: number | null;
  visualCorrectionAvailable: boolean;
  visualCorrectionStatus: import("@reactify/generation-contracts").VisualComparisonStatus | null;
  visualCorrectionAttempt: number;
  visualCorrectionMaxAttempts: number;
  previewCaptureRequired: boolean;
  durations: {
    totalMs: number;
    stages: Record<string, number>;
  };
  featureFlags: {
    enableGenerationPlanEditing: boolean;
  };
  retryAllowed: boolean;
}
