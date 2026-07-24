import type { AllowedImageMimeType } from "@reactify/shared";
import type { ImageStorage } from "./imageStorage.js";
import type { ImageRepository } from "../persistence/repositories/ImageRepository.js";

export async function ensureImagePersisted(
  imageId: string,
  ownerId: string,
  storage: ImageStorage,
  images: ImageRepository,
): Promise<void> {
  const existing = await images.findById(imageId);
  if (existing) {
    return;
  }

  const image = await storage.get(imageId);
  if (!image) {
    return;
  }

  const metadata = await storage.getMetadata(imageId);
  await images.create({
    id: imageId,
    ownerId,
    storageKey: imageId,
    mimeType: image.mimeType,
    sizeBytes: metadata?.sizeBytes ?? image.buffer.length,
    width: metadata?.width,
    height: metadata?.height,
    contentHash: metadata?.contentHash,
  });
}

export async function persistUploadedImage(
  stored: { imageId: string; mimeType: AllowedImageMimeType; sizeBytes: number },
  ownerId: string,
  images: ImageRepository,
  originalFilename?: string,
): Promise<void> {
  await images.create({
    id: stored.imageId,
    ownerId,
    storageKey: stored.imageId,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    originalFilename,
  });
}
