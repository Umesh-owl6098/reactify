import type { PipelineStageName } from "@reactify/generation-contracts";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import type { StageExecutor } from "@reactify/shared";

export class StageRegistry {
  private readonly stages = new Map<PipelineStageName, StageExecutor>();

  register(name: PipelineStageName, executor: StageExecutor): void {
    if (this.stages.has(name)) {
      throw new Error(`Stage "${name}" is already registered`);
    }

    if (!PIPELINE_STAGE_ORDER.includes(name)) {
      throw new Error(`Stage "${name}" is not a valid pipeline stage`);
    }

    this.stages.set(name, executor);
  }

  get(name: PipelineStageName): StageExecutor {
    const stage = this.stages.get(name);
    if (!stage) {
      throw new Error(`Stage "${name}" is not registered`);
    }

    return stage;
  }

  has(name: PipelineStageName): boolean {
    return this.stages.has(name);
  }

  list(): PipelineStageName[] {
    return [...this.stages.keys()];
  }
}

export function createDefaultRegistry(executors: Record<PipelineStageName, StageExecutor>): StageRegistry {
  const registry = new StageRegistry();

  for (const stageName of PIPELINE_STAGE_ORDER) {
    const executor = executors[stageName];
    if (executor) {
      registry.register(stageName, executor);
    }
  }

  return registry;
}
