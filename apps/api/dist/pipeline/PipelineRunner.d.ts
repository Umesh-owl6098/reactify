import type { PipelineStageName } from "@reactify/generation-contracts";
import { type FeatureFlags } from "@reactify/shared";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { StageRegistry } from "./registry.js";
import type { GenerationStore } from "./store.js";
export declare class PipelineRunner {
    private readonly registry;
    private readonly store;
    private readonly imageStorage;
    private readonly flags;
    constructor(registry: StageRegistry, store: GenerationStore, imageStorage: ImageStorage, flags: FeatureFlags);
    start(input: {
        imageId: string;
        projectId?: string;
        failStage?: PipelineStageName;
    }): string;
    cancel(generationId: string): boolean;
    run(generationId: string): Promise<void>;
    private executeStageSafely;
}
//# sourceMappingURL=PipelineRunner.d.ts.map