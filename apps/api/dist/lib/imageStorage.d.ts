import type { AllowedImageMimeType } from "@reactify/shared";
export interface StoredImage {
    imageId: string;
    mimeType: AllowedImageMimeType;
    sizeBytes: number;
}
export declare class ImageStorage {
    private readonly storageDir;
    constructor(storageDir: string);
    ensureReady(): Promise<void>;
    save(buffer: Buffer, mimeType: AllowedImageMimeType): Promise<StoredImage>;
    get(imageId: string): Promise<{
        buffer: Buffer;
        mimeType: AllowedImageMimeType;
    } | null>;
}
//# sourceMappingURL=imageStorage.d.ts.map