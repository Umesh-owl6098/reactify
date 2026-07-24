import type { AllowedImageMimeType } from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
export interface ImageValidationSuccess {
    ok: true;
    mimeType: AllowedImageMimeType;
}
export interface ImageValidationFailure {
    ok: false;
    errorCode: typeof ErrorCode.INVALID_MIME_TYPE | typeof ErrorCode.FILE_TOO_LARGE | typeof ErrorCode.CORRUPTED_IMAGE | typeof ErrorCode.UNSUPPORTED_IMAGE;
    message: string;
}
export type ImageValidationResult = ImageValidationSuccess | ImageValidationFailure;
export declare function validateImageBuffer(buffer: Buffer, maxBytes: number): ImageValidationResult;
//# sourceMappingURL=imageValidator.d.ts.map