import {
  ErrorCode,
  ImageUploadResponseSchema,
  type APIErrorBody,
  type ImageUploadResponse,
} from "@reactify/shared";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

export class UploadRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "UploadRequestError";
  }
}

function parseApiError(responseText: string): UploadRequestError {
  try {
    const body = JSON.parse(responseText) as APIErrorBody;
    if (body.error?.message) {
      return new UploadRequestError(body.error.message, body.error.code);
    }
  } catch {
    // fall through
  }

  return new UploadRequestError("Upload failed. Please try again.");
}

export function getUploadErrorMessage(error: unknown): string {
  if (error instanceof UploadRequestError) {
    switch (error.code) {
      case ErrorCode.INVALID_MIME_TYPE:
        return "Only PNG, JPEG, and WebP images are supported.";
      case ErrorCode.FILE_TOO_LARGE:
        return "Image must be 10 MB or smaller.";
      case ErrorCode.CORRUPTED_IMAGE:
        return "The selected image appears to be corrupted.";
      case ErrorCode.UNSUPPORTED_IMAGE:
        return "The selected file is not a supported image.";
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Upload failed. Please try again.";
}

export function uploadImage(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ImageUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("image", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(ImageUploadResponseSchema.parse(JSON.parse(xhr.responseText)));
        } catch {
          reject(new UploadRequestError("Unexpected upload response from server."));
        }
        return;
      }

      reject(parseApiError(xhr.responseText));
    });

    xhr.addEventListener("error", () => {
      reject(new UploadRequestError("Network error while uploading."));
    });

    xhr.addEventListener("abort", () => {
      reject(new UploadRequestError("Upload was cancelled."));
    });

    xhr.open("POST", `${API_BASE}/api/v1/images`);
    xhr.send(formData);
  });
}

export function getImagePreviewUrl(previewUrl: string): string {
  if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
    return previewUrl;
  }

  return `${API_BASE}${previewUrl}`;
}
