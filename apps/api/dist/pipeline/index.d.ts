import type { ImageStorage } from "../lib/imageStorage.js";
import { PipelineRunner } from "./PipelineRunner.js";
import { GenerationStore } from "./store.js";
export declare function createPipelineServices(imageStorage: ImageStorage): {
    store: GenerationStore;
    registry: import("./registry.js").StageRegistry;
    runner: PipelineRunner;
};
export { PipelineRunner } from "./PipelineRunner.js";
export { StageRegistry } from "./registry.js";
export { GenerationStore } from "./store.js";
export type { GenerationRecord, PipelineState } from "./types.js";
//# sourceMappingURL=index.d.ts.map