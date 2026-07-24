export class ConsolePipelineLogger {
    generationId;
    constructor(generationId) {
        this.generationId = generationId;
    }
    info(msg, meta) {
        console.info(JSON.stringify({ level: "info", generationId: this.generationId, msg, ...meta }));
    }
    warn(msg, meta) {
        console.warn(JSON.stringify({ level: "warn", generationId: this.generationId, msg, ...meta }));
    }
    error(msg, meta) {
        console.error(JSON.stringify({ level: "error", generationId: this.generationId, msg, ...meta }));
    }
}
export class NoopPipelineLogger {
    info() { }
    warn() { }
    error() { }
}
//# sourceMappingURL=logger.js.map