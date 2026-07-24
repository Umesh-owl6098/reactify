import { ErrorCode, type StageResult } from "@reactify/shared";
import type { ImageStorage } from "../../lib/imageStorage.js";
import type { PipelineState } from "../types.js";
import type { StageExecutor } from "@reactify/shared";

export function createUploadValidationStage(imageStorage: ImageStorage): StageExecutor {
  return async (input: unknown): Promise<StageResult<Partial<PipelineState>>> => {
    const state = input as PipelineState;
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
