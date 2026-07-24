import type { PrismaClient } from "@prisma/client";
import type { GenerationRecord } from "../pipeline/types.js";
import { GenerationRepository } from "./repositories/GenerationRepository.js";
import { ImageRepository } from "./repositories/ImageRepository.js";
import { recoverGenerationsAfterRestart } from "./recovery/startupRecovery.js";

export class PersistenceService {
  readonly generations: GenerationRepository;
  readonly images: ImageRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.generations = new GenerationRepository(prisma);
    this.images = new ImageRepository(prisma);
  }

  async loadActiveGenerations(): Promise<GenerationRecord[]> {
    return this.generations.findAllActive();
  }

  async saveGeneration(record: GenerationRecord, expectedStateVersion?: number): Promise<GenerationRecord> {
    const saved = await this.generations.save(record, expectedStateVersion);
    Object.assign(record, saved);
    return saved;
  }

  async recoverAfterRestart(): Promise<number> {
    return recoverGenerationsAfterRestart(this.generations, this.prisma);
  }
}
