import { ErrorCode } from "@reactify/shared";
export function createImagePreparationStage(imageStorage) {
    return async (input) => {
        const state = input;
        const image = await imageStorage.get(state.imageId);
        if (!image) {
            return {
                status: "failed",
                errorCode: ErrorCode.IMAGE_NOT_FOUND,
                errorMessage: "Uploaded image was not found during preparation.",
                durationMs: 0,
            };
        }
        const imageInput = {
            base64: image.buffer.toString("base64"),
            mimeType: image.mimeType,
        };
        return {
            status: "completed",
            output: {
                imageMimeType: image.mimeType,
                imageSizeBytes: image.buffer.length,
                imageBase64: imageInput.base64,
                imageInput,
            },
            durationMs: 0,
        };
    };
}
//# sourceMappingURL=imagePreparation.js.map