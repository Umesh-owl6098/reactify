import type { PipelineStageName } from "@reactify/generation-contracts";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import {
  ErrorCode,
  type AIStageConfig,
  type FeatureFlags,
  type LoadPromptFn,
  type PipelineContext,
  type StageResult,
  type AIProvider,
} from "@reactify/shared";
import type { ImageStorage } from "../lib/imageStorage.js";
import { NoopPipelineLogger } from "./logger.js";
import type { StageRegistry } from "./registry.js";
import type { GenerationStore } from "./store.js";
import type { PipelineState } from "./types.js";

function shouldSkipStage(stage: PipelineStageName, flags: FeatureFlags): boolean {
  if (stage === "automatic_repair" && !flags.enableRepair) {
    return true;
  }

  return false;
}

function mergeState(state: PipelineState, output: unknown): PipelineState {
  if (!output || typeof output !== "object") {
    return state;
  }

  return { ...state, ...(output as Partial<PipelineState>) };
}

export interface PipelineRunnerServices {
  aiProvider: AIProvider;
  loadPrompt: LoadPromptFn;
  aiConfig: AIStageConfig;
}

export class PipelineRunner {
  constructor(
    private readonly registry: StageRegistry,
    private readonly store: GenerationStore,
    private readonly imageStorage: ImageStorage,
    private readonly flags: FeatureFlags,
    private readonly services: PipelineRunnerServices,
  ) {}

  start(input: { imageId: string; projectId?: string; failStage?: PipelineStageName }): string {
    const record = this.store.create(input);
    void this.run(record.id);
    return record.id;
  }

  cancel(generationId: string): boolean {
    return this.store.cancel(generationId);
  }

  async run(generationId: string): Promise<void> {
    const record = this.store.get(generationId);
    if (!record) {
      return;
    }

    let state: PipelineState = { imageId: record.imageId };
    const logger = new NoopPipelineLogger();
    const context: PipelineContext = {
      generationId: record.id,
      projectId: record.projectId,
      imageId: record.imageId,
      logger,
      flags: this.flags,
      aiProvider: this.services.aiProvider,
      loadPrompt: this.services.loadPrompt,
      aiConfig: this.services.aiConfig,
      failStage: record.failStage,
    };

    for (const stageName of PIPELINE_STAGE_ORDER) {
      const current = this.store.get(generationId);
      if (!current) {
        return;
      }

      if (current.cancelled) {
        current.activeStage = null;
        current.status = "Cancelled";
        return;
      }

      if (shouldSkipStage(stageName, this.flags)) {
        this.store.markStageRunning(current, stageName);
        this.store.markStageFinished(current, stageName, {
          status: "skipped",
          durationMs: 0,
        });
        continue;
      }

      let executor;
      try {
        executor = this.registry.get(stageName);
      } catch (error) {
        current.status = "Failed";
        current.activeStage = null;
        current.errors.push({
          stage: stageName,
          code: ErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : "Invalid stage registration",
        });
        return;
      }

      this.store.markStageRunning(current, stageName);

      const result = await this.executeStageSafely(
        executor,
        state,
        context,
        stageName,
        current.failStage,
      );

      this.store.markStageFinished(current, stageName, {
        status: result.status === "completed" ? "completed" : result.status === "skipped" ? "skipped" : "failed",
        durationMs: result.durationMs,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      if (result.status === "failed") {
        current.status = "Failed";
        current.activeStage = null;
        current.errors.push({
          stage: stageName,
          code: result.errorCode ?? ErrorCode.INTERNAL_ERROR,
          message: result.errorMessage ?? "Stage failed",
        });
        return;
      }

      if (result.status === "completed" && result.output) {
        state = mergeState(state, result.output);
        this.store.applyStateOutputs(current, state);
      }
    }

    const finished = this.store.get(generationId);
    if (!finished || finished.cancelled) {
      return;
    }

    finished.status = "Ready";
    finished.activeStage = null;
    finished.updatedAt = new Date().toISOString();
  }

  private async executeStageSafely(
    executor: (input: unknown, context: PipelineContext) => Promise<StageResult<unknown>>,
    state: PipelineState,
    context: PipelineContext,
    stageName: PipelineStageName,
    failStage?: PipelineStageName,
  ): Promise<StageResult<unknown>> {
    const startedAt = Date.now();

    if (failStage === stageName) {
      return {
        status: "failed",
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorMessage: `Forced failure at ${stageName}`,
        durationMs: Date.now() - startedAt,
      };
    }

    try {
      const result = await executor(state, context);
      return {
        ...result,
        durationMs: result.durationMs ?? Date.now() - startedAt,
      };
    } catch (error) {
      return {
        status: "failed",
        errorCode: ErrorCode.INTERNAL_ERROR,
        errorMessage: error instanceof Error ? error.message : "Unhandled stage exception",
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
