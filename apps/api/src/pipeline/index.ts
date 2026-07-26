import type { AIProvider, LoadPromptFn } from "@reactify/shared";
import type { Env } from "../env.js";
import { resolveFeatureFlags } from "../env.js";
import { resolveActiveModel } from "../providers/ai-provider-config.js";
import { resolveMockFailureStage } from "./mock-failure-stage.js";
import { defaultLoadPrompt } from "../prompts/loader.js";
import { createAIProvider } from "../providers/providerFactory.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import { PipelineRunner } from "./PipelineRunner.js";
import { createDefaultRegistry } from "./registry.js";
import { createStageExecutors } from "./stages/index.js";
import { GenerationStore } from "./store.js";

export interface CreatePipelineServicesOptions {
  env: Env;
  aiProvider?: AIProvider;
  loadPrompt?: LoadPromptFn;
}

/**
 * Pipeline services coordinate the generation workflow.
 *
 * Browser-assisted sandbox validation: after static validation, the pipeline
 * pauses at sandbox_compilation and waits for the web client to compile the
 * generated project in Sandpack and POST results to the sandbox-validation API.
 */
export function createPipelineServices(
  imageStorage: ImageStorage,
  options: CreatePipelineServicesOptions,
) {
  const featureFlags = resolveFeatureFlags(options.env);
  const store = new GenerationStore(
    featureFlags,
    options.env.MAX_REPAIR_ATTEMPTS,
    options.env.MAX_VISUAL_CORRECTION_ATTEMPTS,
  );
  const registry = createDefaultRegistry(createStageExecutors(imageStorage));
  const aiProvider = options.aiProvider ?? createAIProvider(options.env);
  const loadPrompt = options.loadPrompt ?? defaultLoadPrompt;
  const aiConfig = {
    model: resolveActiveModel(options.env),
    temperature: options.env.AI_TEMPERATURE,
    maxTokens: options.env.AI_MAX_TOKENS,
    timeoutMs: options.env.AI_TIMEOUT_MS,
  };
  const repairConfig = {
    maxAttempts: options.env.MAX_REPAIR_ATTEMPTS,
    maxPatchFileBytes: options.env.MAX_PATCH_FILE_BYTES,
    maxPatchTotalBytes: options.env.MAX_PATCH_TOTAL_BYTES,
  };
  const runner = new PipelineRunner(registry, store, imageStorage, featureFlags, {
    aiProvider,
    loadPrompt,
    aiConfig,
    repairConfig,
    mockFailureStage: resolveMockFailureStage(options.env.MOCK_AI_FAILURE_STAGE),
  });

  return {
    store,
    registry,
    runner,
  };
}

export { PipelineRunner } from "./PipelineRunner.js";
export { StageRegistry } from "./registry.js";
export { GenerationStore } from "./store.js";
export type { GenerationRecord, PipelineState } from "./types.js";
