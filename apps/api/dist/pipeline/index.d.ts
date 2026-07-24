import { type AIProvider, type LoadPromptFn } from "@reactify/shared";
import type { Env } from "../env.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import { PipelineRunner } from "./PipelineRunner.js";
import { GenerationStore } from "./store.js";
export interface CreatePipelineServicesOptions {
    env: Env;
    aiProvider?: AIProvider;
    loadPrompt?: LoadPromptFn;
}
export declare function createPipelineServices(imageStorage: ImageStorage, options: CreatePipelineServicesOptions): {
    store: GenerationStore;
    registry: import("./registry.js").StageRegistry;
    runner: PipelineRunner;
};
export { PipelineRunner } from "./PipelineRunner.js";
export { StageRegistry } from "./registry.js";
export { GenerationStore } from "./store.js";
export type { GenerationRecord, PipelineState } from "./types.js";
//# sourceMappingURL=index.d.ts.map