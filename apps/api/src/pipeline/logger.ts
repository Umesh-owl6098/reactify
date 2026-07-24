import type { PipelineLogger } from "@reactify/shared";

export class ConsolePipelineLogger implements PipelineLogger {
  constructor(private readonly generationId: string) {}

  info(msg: string, meta?: Record<string, unknown>): void {
    console.info(JSON.stringify({ level: "info", generationId: this.generationId, msg, ...meta }));
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify({ level: "warn", generationId: this.generationId, msg, ...meta }));
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    console.error(JSON.stringify({ level: "error", generationId: this.generationId, msg, ...meta }));
  }
}

export class NoopPipelineLogger implements PipelineLogger {
  info(): void {}
  warn(): void {}
  error(): void {}
}
