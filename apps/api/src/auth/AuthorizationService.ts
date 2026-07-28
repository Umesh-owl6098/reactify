import type { GenerationRecord } from "../pipeline/types.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { AuthRepository } from "./AuthRepository.js";
import type { ImageStorage } from "../lib/imageStorage.js";
import type { Env } from "../env.js";
import { isAuthDisabled } from "./auth-mode.js";

export class AuthorizationService {
  constructor(
    private readonly store: GenerationStore,
    private readonly authRepository: AuthRepository,
    private readonly env: Env,
    private readonly imageStorage?: ImageStorage,
  ) {}

  getEnv(): Env {
    return this.env;
  }

  getGenerationIfExists(generationId: string): GenerationRecord | null {
    return this.store.get(generationId) ?? null;
  }

  getOwnedGeneration(userId: string, generationId: string): GenerationRecord | null {
    if (isAuthDisabled(this.env)) {
      return this.getGenerationIfExists(generationId);
    }

    const record = this.store.get(generationId);
    if (!record || record.ownerId !== userId) {
      return null;
    }
    return record;
  }

  getOwnedGenerationIncludingDeleted(userId: string, generationId: string): GenerationRecord | null {
    if (isAuthDisabled(this.env)) {
      const record = this.store.getIncludingDeleted(generationId);
      return record ?? null;
    }

    const record = this.store.getIncludingDeleted(generationId);
    if (!record || record.ownerId !== userId) {
      return null;
    }
    return record;
  }

  async imageExists(imageId: string): Promise<boolean> {
    const image = await this.authRepository.findImageById(imageId);
    if (image) {
      return true;
    }

    if (this.imageStorage) {
      const metadata = await this.imageStorage.getMetadata(imageId);
      return Boolean(metadata);
    }

    return false;
  }

  async userOwnsImage(userId: string, imageId: string): Promise<boolean> {
    if (isAuthDisabled(this.env)) {
      return this.imageExists(imageId);
    }

    const image = await this.authRepository.findOwnedImage(userId, imageId);
    if (image) {
      return true;
    }

    if (this.imageStorage) {
      const metadata = await this.imageStorage.getMetadata(imageId);
      if (metadata?.ownerId === userId) {
        return true;
      }
    }

    return false;
  }
}
