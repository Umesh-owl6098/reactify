export declare const APP_VERSION: "0.1.0";
export declare const ErrorCode: {
    readonly INVALID_MIME_TYPE: "INVALID_MIME_TYPE";
    readonly FILE_TOO_LARGE: "FILE_TOO_LARGE";
    readonly IMAGE_NOT_FOUND: "IMAGE_NOT_FOUND";
    readonly CORRUPTED_IMAGE: "CORRUPTED_IMAGE";
    readonly UNSUPPORTED_IMAGE: "UNSUPPORTED_IMAGE";
    readonly GENERATION_NOT_FOUND: "GENERATION_NOT_FOUND";
    readonly AI_RESPONSE_VERSION_MISSING: "AI_RESPONSE_VERSION_MISSING";
    readonly ANALYSIS_SCHEMA_INVALID: "ANALYSIS_SCHEMA_INVALID";
    readonly AI_TIMEOUT: "AI_TIMEOUT";
    readonly AI_ERROR: "AI_ERROR";
    readonly GENERATION_SCHEMA_INVALID: "GENERATION_SCHEMA_INVALID";
    readonly PLAN_SCHEMA_INVALID: "PLAN_SCHEMA_INVALID";
    readonly UNSAFE_DEPENDENCY: "UNSAFE_DEPENDENCY";
    readonly UNSAFE_PATH: "UNSAFE_PATH";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
};
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
export interface APIErrorBody {
    error: {
        code: ErrorCode;
        message: string;
        requestId: string;
        fieldErrors?: Record<string, string>;
    };
}
//# sourceMappingURL=errors.d.ts.map