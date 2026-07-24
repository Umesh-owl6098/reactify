import type { PipelineStageName } from "@reactify/generation-contracts";
import { type AIStageConfig, type FeatureFlags, type LoadPromptFn, type AIProvider } from "@reactify/shared";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { StageRegistry } from "./registry.js";
import type { GenerationStore } from "./store.js";
export interface PipelineRunnerServices {
    aiProvider: AIProvider;
    loadPrompt: LoadPromptFn;
    aiConfig: AIStageConfig;
}
export declare class PipelineRunner {
    private readonly registry;
    private readonly store;
    private readonly imageStorage;
    private readonly flags;
    private readonly services;
    constructor(registry: StageRegistry, store: GenerationStore, imageStorage: ImageStorage, flags: FeatureFlags, services: PipelineRunnerServices);
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