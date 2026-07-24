import type { AIProvider, LoadPromptFn } from "@reactify/shared";
import type { Env } from "../env.js";
import { resolveFeatureFlags } from "../env.js";
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

export function createPipelineServices(
  imageStorage: ImageStorage,
  options: CreatePipelineServicesOptions,
) {
  const featureFlags = resolveFeatureFlags(options.env);
  const store = new GenerationStore(featureFlags);
  const registry = createDefaultRegistry(createStageExecutors(imageStorage));
  const aiProvider = options.aiProvider ?? createAIProvider(options.env);
  const loadPrompt = options.loadPrompt ?? defaultLoadPrompt;
  const aiConfig = {
    model: options.env.ANTHROPIC_MODEL,
    temperature: options.env.AI_TEMPERATURE,
    maxTokens: options.env.AI_MAX_TOKENS,
    timeoutMs: options.env.AI_TIMEOUT_MS,
  };
  const runner = new PipelineRunner(registry, store, imageStorage, featureFlags, {
    aiProvider,
    loadPrompt,
    aiConfig,
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
