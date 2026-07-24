import type { PipelineLogger } from "@reactify/shared";
export declare class ConsolePipelineLogger implements PipelineLogger {
    private readonly generationId;
    constructor(generationId: string);
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
}
export declare class NoopPipelineLogger implements PipelineLogger {
    info(): void;
    warn(): void;
    error(): void;
}
//# sourceMappingURL=logger.d.ts.map