import type { PipelineStageName } from "@reactify/generation-contracts";
import type { StageExecutor } from "@reactify/shared";
export declare class StageRegistry {
    private readonly stages;
    register(name: PipelineStageName, executor: StageExecutor): void;
    get(name: PipelineStageName): StageExecutor;
    has(name: PipelineStageName): boolean;
    list(): PipelineStageName[];
}
export declare function createDefaultRegistry(executors: Record<PipelineStageName, StageExecutor>): StageRegistry;
//# sourceMappingURL=registry.d.ts.map