import { ErrorCode } from "@reactify/shared";
export function createUploadValidationStage(imageStorage) {
    return async (input) => {
        const state = input;
        const image = await imageStorage.get(state.imageId);
        if (!image) {
            return {
                status: "failed",
                errorCode: ErrorCode.IMAGE_NOT_FOUND,
                errorMessage: "Uploaded image was not found.",
                durationMs: 0,
            };
        }
        return {
            status: "completed",
            output: {
                imageMimeType: image.mimeType,
                imageSizeBytes: image.buffer.length,
            },
            durationMs: 0,
        };
    };
}
//# sourceMappingURL=uploadValidation.js.map