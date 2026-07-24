import { z } from "zod";
export const UPLOAD_MAX_BYTES = 10_485_760;
export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const AllowedImageMimeTypeSchema = z.enum(ALLOWED_IMAGE_MIME_TYPES);
export const ImageUploadResponseSchema = z.object({
    imageId: z.string().uuid(),
    mimeType: AllowedImageMimeTypeSchema,
    sizeBytes: z.number().int().positive().max(UPLOAD_MAX_BYTES),
    previewUrl: z.string().startsWith("/api/v1/images/"),
});
export const UPLOAD_ACCEPT = {
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
};
export function formatUploadMaxSizeLabel() {
    return "10 MB";
}
//# sourceMappingURL=upload.js.map