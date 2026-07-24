import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { PipelineRunner } from "./PipelineRunner.js";
import { createDefaultRegistry } from "./registry.js";
import { createStageExecutors } from "./stages/index.js";
import { GenerationStore } from "./store.js";
export function createPipelineServices(imageStorage) {
    const store = new GenerationStore();
    const registry = createDefaultRegistry(createStageExecutors(imageStorage));
    const runner = new PipelineRunner(registry, store, imageStorage, DEFAULT_FEATURE_FLAGS);
    return {
        store,
        registry,
        runner,
    };
}
export { PipelineRunner } from "./PipelineRunner.js";
export { StageRegistry } from "./registry.js";
export { GenerationStore } from "./store.js";
//# sourceMappingURL=index.js.map