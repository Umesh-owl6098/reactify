import type { PipelineStageName } from "@reactify/generation-contracts";
import type { AIProvider } from "./ai-provider.js";

export interface PromptMeta {
  promptVersion: string;
  schemaVersion: string;
}

export interface LoadedPrompt {
  meta: PromptMeta;
  content: string;
}

export type LoadPromptFn = (
  name: "design-analysis" | "generation-plan" | "react-project-generation" | "generation" | "repair",
) => LoadedPrompt;

export interface AIStageConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface PipelineLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface StageResult<T = unknown> {
  status: "completed" | "failed" | "skipped" | "paused";
  output?: T;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
}

export interface PipelineStage<TInput = unknown, TOutput = unknown> {
  readonly name: PipelineStageName;
  execute(input: TInput, context: PipelineContext): Promise<StageResult<TOutput>>;
}

export interface PipelineContext {
  generationId: string;
  projectId: string;
  imageId: string;
  logger: PipelineLogger;
  flags: import("./feature-flags.js").FeatureFlags;
  aiProvider: AIProvider;
  loadPrompt: LoadPromptFn;
  aiConfig: AIStageConfig;
  failStage?: PipelineStageName;
}

export type StageExecutor = (
  input: unknown,
  context: PipelineContext,
) => Promise<StageResult<unknown>>;
