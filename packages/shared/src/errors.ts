export const APP_VERSION = "0.1.0" as const;

export const ErrorCode = {
  INVALID_MIME_TYPE: "INVALID_MIME_TYPE",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  IMAGE_NOT_FOUND: "IMAGE_NOT_FOUND",
  CORRUPTED_IMAGE: "CORRUPTED_IMAGE",
  UNSUPPORTED_IMAGE: "UNSUPPORTED_IMAGE",
  GENERATION_NOT_FOUND: "GENERATION_NOT_FOUND",
  GENERATION_SCHEMA_INVALID: "GENERATION_SCHEMA_INVALID",
  PLAN_SCHEMA_INVALID: "PLAN_SCHEMA_INVALID",
  UNSAFE_DEPENDENCY: "UNSAFE_DEPENDENCY",
  UNSAFE_PATH: "UNSAFE_PATH",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface APIErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    fieldErrors?: Record<string, string>;
  };
}
