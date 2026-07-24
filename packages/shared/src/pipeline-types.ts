import type { PipelineStageName } from "@reactify/generation-contracts";

export interface PipelineLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export interface StageResult<T = unknown> {
  status: "completed" | "failed" | "skipped";
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
  failStage?: PipelineStageName;
}

export type StageExecutor = (
  input: unknown,
  context: PipelineContext,
) => Promise<StageResult<unknown>>;
