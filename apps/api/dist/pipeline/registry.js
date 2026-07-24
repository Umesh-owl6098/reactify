import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
export class StageRegistry {
    stages = new Map();
    register(name, executor) {
        if (this.stages.has(name)) {
            throw new Error(`Stage "${name}" is already registered`);
        }
        if (!PIPELINE_STAGE_ORDER.includes(name)) {
            throw new Error(`Stage "${name}" is not a valid pipeline stage`);
        }
        this.stages.set(name, executor);
    }
    get(name) {
        const stage = this.stages.get(name);
        if (!stage) {
            throw new Error(`Stage "${name}" is not registered`);
        }
        return stage;
    }
    has(name) {
        return this.stages.has(name);
    }
    list() {
        return [...this.stages.keys()];
    }
}
export function createDefaultRegistry(executors) {
    const registry = new StageRegistry();
    for (const stageName of PIPELINE_STAGE_ORDER) {
        const executor = executors[stageName];
        if (executor) {
            registry.register(stageName, executor);
        }
    }
    return registry;
}
//# sourceMappingURL=registry.js.map