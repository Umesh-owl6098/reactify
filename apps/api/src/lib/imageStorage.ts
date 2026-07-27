import { randomUUID } from "node:crypto";
import type { AllowedImageMimeType } from "@reactify/shared";
import type { StorageProvider } from "./storage/types.js";

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
  constructor(
    private readonly storage: StorageProvider,
    private readonly keyPrefix = "images",
  ) {}

  async ensureReady(): Promise<void> {
    // Object storage does not require local directory initialization.
  }

  private dataKey(imageId: string): string {
    return `${this.keyPrefix}/${imageId}`;
  }

  private metaKey(imageId: string): string {
    return `${this.keyPrefix}/${imageId}.meta.json`;
  }

  async save(
    buffer: Buffer,
    mimeType: AllowedImageMimeType,
    originalFilename?: string,
    ownerId?: string,
  ): Promise<StoredImage & { width?: number; height?: number; contentHash?: string }> {
    const imageId = randomUUID();
    const metadata: ImageMetadata = {
      mimeType,
      sizeBytes: buffer.length,
      originalFilename,
      ...(ownerId ? { ownerId } : {}),
    };

    await this.storage.putObject(this.dataKey(imageId), buffer, {
      contentType: mimeType,
      contentLength: buffer.length,
    });
    await this.storage.putObject(this.metaKey(imageId), Buffer.from(JSON.stringify(metadata)), {
      contentType: "application/json",
    });

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

    const metaRaw = await this.storage.getObject(this.metaKey(imageId));
    if (!metaRaw) {
      return null;
    }

    try {
      return JSON.parse(metaRaw.toString("utf8")) as ImageMetadata;
    } catch {
      return null;
    }
  }

  getStorageKey(imageId: string): string | null {
    if (!UUID_PATTERN.test(imageId)) {
      return null;
    }
    return this.dataKey(imageId);
  }

  async get(imageId: string): Promise<{ buffer: Buffer; mimeType: AllowedImageMimeType } | null> {
    if (!UUID_PATTERN.test(imageId)) {
      return null;
    }

    const [buffer, metaRaw] = await Promise.all([
      this.storage.getObject(this.dataKey(imageId)),
      this.storage.getObject(this.metaKey(imageId)),
    ]);

    if (!buffer || !metaRaw) {
      return null;
    }

    try {
      const metadata = JSON.parse(metaRaw.toString("utf8")) as ImageMetadata;
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

    await Promise.allSettled([
      this.storage.deleteObject(this.dataKey(imageId)),
      this.storage.deleteObject(this.metaKey(imageId)),
    ]);
  }
}
