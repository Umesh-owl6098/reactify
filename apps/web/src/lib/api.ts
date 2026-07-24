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

function parseApiError(responseText: string, status: number): UploadRequestError {
  if (!responseText.trim()) {
    if (status === 502 || status === 503 || status === 504) {
      return new UploadRequestError(
        "Upload failed: the API server is unavailable. Confirm the backend is running.",
      );
    }
    return new UploadRequestError("Upload failed. Please try again.");
  }

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
    const prefix = "Upload failed: ";
    switch (error.code) {
      case ErrorCode.INVALID_MIME_TYPE:
        return `${prefix}only PNG, JPEG, and WebP images are supported.`;
      case ErrorCode.FILE_TOO_LARGE:
        return `${prefix}the image must be 10 MB or smaller.`;
      case ErrorCode.CORRUPTED_IMAGE:
        return `${prefix}the server rejected the image because its signature did not match PNG, JPEG, or WebP.`;
      case ErrorCode.UNSUPPORTED_IMAGE:
        return `${prefix}${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
      case ErrorCode.AUTHENTICATION_REQUIRED:
        return `${prefix}sign in is required before uploading.`;
      case ErrorCode.FORBIDDEN:
        return `${prefix}this browser origin is not allowed to upload images.`;
      case ErrorCode.DATABASE_UNAVAILABLE:
      case ErrorCode.DATABASE_QUERY_FAILED:
        return `${prefix}${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
      default:
        return error.message.startsWith("Upload failed:")
          ? error.message
          : `${prefix}${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
    }
  }

  if (error instanceof Error) {
    return error.message.startsWith("Upload failed:")
      ? error.message
      : `Upload failed: ${error.message.charAt(0).toLowerCase()}${error.message.slice(1)}`;
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

      reject(parseApiError(xhr.responseText, xhr.status));
    });

    xhr.addEventListener("error", () => {
      reject(
        new UploadRequestError(
          "Upload failed: a network error occurred while contacting the API server.",
        ),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(new UploadRequestError("Upload was cancelled."));
    });

    xhr.open("POST", `${API_BASE}/api/v1/images`);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

export function getImagePreviewUrl(previewUrl: string): string {
  if (previewUrl.startsWith("http://") || previewUrl.startsWith("https://")) {
    return previewUrl;
  }

  return `${API_BASE}${previewUrl}`;
}
