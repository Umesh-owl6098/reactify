import type { GenerationRecord } from "../pipeline/types.js";
import type { GenerationStore } from "../pipeline/store.js";
import type { AuthRepository } from "./AuthRepository.js";
import type { ImageStorage } from "../lib/imageStorage.js";

export class AuthorizationService {
  constructor(
    private readonly store: GenerationStore,
    private readonly authRepository: AuthRepository,
    private readonly imageStorage?: ImageStorage,
  ) {}

  getOwnedGeneration(userId: string, generationId: string): GenerationRecord | null {
    const record = this.store.get(generationId);
    if (!record || record.ownerId !== userId) {
      return null;
    }
    return record;
  }

  getOwnedGenerationIncludingDeleted(userId: string, generationId: string): GenerationRecord | null {
    const record = this.store.getIncludingDeleted(generationId);
    if (!record || record.ownerId !== userId) {
      return null;
    }
    return record;
  }

  async userOwnsImage(userId: string, imageId: string): Promise<boolean> {
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
