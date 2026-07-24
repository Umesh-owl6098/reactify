import type { DesignAnalysisV1, GeneratedProjectV1, GenerationPlanV1, PipelineStageLogEntry, PipelineStageName } from "@reactify/generation-contracts";
import type { AllowedImageMimeType } from "@reactify/shared";
import type { GenerationUserStatus } from "@reactify/generation-contracts";
export interface PipelineState {
    imageId: string;
    imageMimeType?: AllowedImageMimeType;
    imageSizeBytes?: number;
    imageBase64?: string;
    designAnalysis?: DesignAnalysisV1;
    generationPlan?: GenerationPlanV1;
    generatedProject?: GeneratedProjectV1;
    planConfirmed?: boolean;
}
export interface GenerationErrorRecord {
    stage: PipelineStageName;
    code: string;
    message: string;
}
export interface GenerationRecord {
    id: string;
    imageId: string;
    projectId: string;
    status: GenerationUserStatus;
    activeStage: PipelineStageName | null;
    stages: PipelineStageLogEntry[];
    outputs: {
        designAnalysis: DesignAnalysisV1 | null;
        generationPlan: GenerationPlanV1 | null;
        generatedProject: GeneratedProjectV1 | null;
    };
    errors: GenerationErrorRecord[];
    cancelled: boolean;
    failStage?: PipelineStageName;
    createdAt: string;
    updatedAt: string;
}
export interface GenerationStoreSnapshot extends Omit<GenerationRecord, "cancelled" | "failStage"> {
    durations: {
        totalMs: number;
        stages: Record<string, number>;
    };
}
//# sourceMappingURL=types.d.ts.map