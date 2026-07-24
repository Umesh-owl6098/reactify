import type { PipelineStageLogEntry, PipelineStageName } from "@reactify/generation-contracts";
import type { GenerationRecord, GenerationStoreSnapshot, PipelineState } from "./types.js";
export declare class GenerationStore {
    private readonly records;
    create(input: {
        imageId: string;
        projectId?: string;
        failStage?: PipelineStageName;
    }): GenerationRecord;
    get(id: string): GenerationRecord | undefined;
    cancel(id: string): boolean;
    markStageRunning(record: GenerationRecord, stage: PipelineStageName): void;
    markStageFinished(record: GenerationRecord, stage: PipelineStageName, entry: Omit<PipelineStageLogEntry, "stage">): void;
    applyStateOutputs(record: GenerationRecord, state: PipelineState): void;
    toSnapshot(record: GenerationRecord): GenerationStoreSnapshot;
}
//# sourceMappingURL=store.d.ts.map