import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AllowedImageMimeType } from "@reactify/shared";

export interface StoredImage {
  imageId: string;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
}

interface ImageMetadata {
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  ownerId?: string;
  width?: number;
  height?: number;
  contentHash?: string;
  originalFilename?: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ImageStorage {
  constructor(private readonly storageDir: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.storageDir, { recursive: true });
  }

  async save(
    buffer: Buffer,
    mimeType: AllowedImageMimeType,
    originalFilename?: string,
    ownerId?: string,
  ): Promise<StoredImage & { width?: number; height?: number; contentHash?: string }> {
    await this.ensureReady();

    const imageId = randomUUID();
    const dataPath = join(this.storageDir, imageId);
    const metaPath = join(this.storageDir, `${imageId}.meta.json`);
    const metadata: ImageMetadata = {
      mimeType,
      sizeBytes: buffer.length,
      originalFilename,
      ...(ownerId ? { ownerId } : {}),
    };

    await writeFile(dataPath, buffer);
    await writeFile(metaPath, JSON.stringify(metadata));

    return {
      imageId,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async getMetadata(imageId: string): Promise<ImageMetadata | null> {
    if (!UUID_PATTERN.test(imageId)) {
      return null;
    }

    const metaPath = join(this.storageDir, `${imageId}.meta.json`);
    try {
      const metaRaw = await readFile(metaPath, "utf8");
      return JSON.parse(metaRaw) as ImageMetadata;
    } catch {
      return null;
    }
  }

  getStorageKey(imageId: string): string | null {
    if (!UUID_PATTERN.test(imageId)) {
      return null;
    }
    return imageId;
  }

  async get(imageId: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMimeType } | null> {
    if (!UUID_PATTERN.test(imageId)) {
      return null;
    }

    const dataPath = join(this.storageDir, imageId);
    const metaPath = join(this.storageDir, `${imageId}.meta.json`);

    try {
      const [buffer, metaRaw] = await Promise.all([readFile(dataPath), readFile(metaPath, "utf8")]);
      const metadata = JSON.parse(metaRaw) as ImageMetadata;

      return {
        buffer,
        mimeType: metadata.mimeType,
      };
    } catch {
      return null;
    }
  }

  async delete(imageId: string): Promise<void> {
    if (!UUID_PATTERN.test(imageId)) {
      return;
    }

    const dataPath = join(this.storageDir, imageId);
    const metaPath = join(this.storageDir, `${imageId}.meta.json`);
    const { unlink } = await import("node:fs/promises");

    await Promise.allSettled([unlink(dataPath), unlink(metaPath)]);
  }
}
