import { z } from "zod";

export const UPLOAD_MAX_BYTES = 10_485_760;

export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const AllowedImageMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);

export type AllowedImageMimeType = z.infer<typeof AllowedImageMimeTypeSchema>;

export const ImageUploadResponseSchema = z.object({
  imageId: z.string().uuid(),
  mimeType: AllowedImageMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
  previewUrl: z.string().startsWith("/api/v1/images/"),
});

export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;

export const UPLOAD_ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
} as const satisfies Record<AllowedImageMimeType, readonly string[]>;

export function formatUploadMaxSizeLabel(): string {
  return "10 MB";
}
