import { z } from "zod";
export declare const UPLOAD_MAX_BYTES = 10485760;
export declare const ALLOWED_IMAGE_MIME_TYPES: readonly ["image/png", "image/jpeg", "image/webp"];
export declare const AllowedImageMimeTypeSchema: z.ZodEnum<["image/png", "image/jpeg", "image/webp"]>;
export type AllowedImageMimeType = z.infer<typeof AllowedImageMimeTypeSchema>;
export declare const ImageUploadResponseSchema: z.ZodObject<{
    imageId: z.ZodString;
    mimeType: z.ZodEnum<["image/png", "image/jpeg", "image/webp"]>;
    sizeBytes: z.ZodNumber;
    previewUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    imageId: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    sizeBytes: number;
    previewUrl: string;
}, {
    imageId: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    sizeBytes: number;
    previewUrl: string;
}>;
export type ImageUploadResponse = z.infer<typeof ImageUploadResponseSchema>;
export declare const UPLOAD_ACCEPT: {
    readonly "image/png": readonly [".png"];
    readonly "image/jpeg": readonly [".jpg", ".jpeg"];
    readonly "image/webp": readonly [".webp"];
};
export declare function formatUploadMaxSizeLabel(): string;
//# sourceMappingURL=upload.d.ts.map