import { VisualCorrectionV1Schema, type VisualCorrectionV1 } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText } from "../extractJson.js";

export function parseVisualCorrectionResponse(rawText: string):
  | { ok: true; correction: VisualCorrectionV1 }
  | { ok: false; errorCode: typeof ErrorCode.PATCH_SCHEMA_INVALID; message: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return { ok: false, errorCode: ErrorCode.PATCH_SCHEMA_INVALID, message: "Visual correction response was not valid JSON." };
  }

  const parsed = VisualCorrectionV1Schema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: ErrorCode.PATCH_SCHEMA_INVALID,
      message: "Visual correction response did not match VisualCorrectionV1.",
    };
  }

  return { ok: true, correction: parsed.data };
}
