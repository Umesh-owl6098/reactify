import { AIResponseEnvelopeSchema, ProjectPatchV1Schema, type ProjectPatchV1 } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText } from "../extractJson.js";

export interface ParsedProjectPatchSuccess {
  ok: true;
  patch: ProjectPatchV1;
}

export interface ParsedProjectPatchFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.AI_RESPONSE_VERSION_MISSING
    | typeof ErrorCode.PATCH_SCHEMA_INVALID;
  message: string;
}

export type ParsedProjectPatchResult = ParsedProjectPatchSuccess | ParsedProjectPatchFailure;

export function parseProjectPatchResponse(rawText: string): ParsedProjectPatchResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_SCHEMA_INVALID,
      message: "Project patch response was not valid JSON.",
    };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING,
      message: "Project patch response is missing schemaVersion or responseVersion.",
    };
  }

  const patchResult = ProjectPatchV1Schema.safeParse(parsedJson);
  if (!patchResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_SCHEMA_INVALID,
      message: "Project patch response failed schema validation.",
    };
  }

  return { ok: true, patch: patchResult.data };
}
