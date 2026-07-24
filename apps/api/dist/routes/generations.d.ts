import type { FastifyInstance } from "fastify";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { PipelineRunner, GenerationStore } from "../pipeline/index.js";
export declare function registerGenerationRoutes(app: FastifyInstance, imageStorage: ImageStorage, store: GenerationStore, runner: PipelineRunner): Promise<void>;
//# sourceMappingURL=generations.d.ts.map