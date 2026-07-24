export const APP_VERSION = "0.1.0" as const;

export const ErrorCode = {
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
