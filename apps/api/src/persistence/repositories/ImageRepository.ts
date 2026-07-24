import type { PrismaClient } from "@prisma/client";
import type { AllowedImageMimeType } from "@reactify/shared";
import { mapPrismaError } from "../errors.js";

export interface PersistedImageMetadata {
  id: string;
  storageKey: string;
  originalFilename: string | null;
  mimeType: AllowedImageMimeType;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  contentHash: string | null;
  createdAt: string;
}

export class ImageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    id: string;
    ownerId: string;
    storageKey: string;
    mimeType: AllowedImageMimeType;
    sizeBytes: number;
    originalFilename?: string;
    width?: number;
    height?: number;
    contentHash?: string;
  }): Promise<PersistedImageMetadata> {
    try {
      const row = await this.prisma.uploadedImage.create({
        data: {
          id: input.id,
          ownerId: input.ownerId,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          originalFilename: input.originalFilename ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          contentHash: input.contentHash ?? null,
        },
      });
      return {
        id: row.id,
        storageKey: row.storageKey,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType as AllowedImageMimeType,
        sizeBytes: row.sizeBytes,
        width: row.width,
        height: row.height,
        contentHash: row.contentHash,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error) {
      throw mapPrismaError(error);
    }
  }

  async findById(id: string): Promise<PersistedImageMetadata | null> {
    try {
      const row = await this.prisma.uploadedImage.findUnique({ where: { id } });
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        storageKey: row.storageKey,
        originalFilename: row.originalFilename,
        mimeType: row.mimeType as AllowedImageMimeType,
        sizeBytes: row.sizeBytes,
        width: row.width,
        height: row.height,
        contentHash: row.contentHash,
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error) {
      throw mapPrismaError(error);
    }
  }
}
