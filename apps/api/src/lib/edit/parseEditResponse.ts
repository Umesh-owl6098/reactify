import { EditIntentV1Schema, ProjectEditV1Schema, type EditIntentV1, type ProjectEditV1 } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText } from "../extractJson.js";
import { AIResponseEnvelopeSchema } from "@reactify/generation-contracts";

export function parseEditIntentResponse(rawText: string):
  | { ok: true; intent: EditIntentV1 }
  | { ok: false; errorCode: typeof ErrorCode.AI_RESPONSE_VERSION_MISSING | typeof ErrorCode.EDIT_SCHEMA_INVALID; message: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return { ok: false, errorCode: ErrorCode.EDIT_SCHEMA_INVALID, message: "Edit intent response was not valid JSON." };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return { ok: false, errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING, message: "Edit intent response is missing schemaVersion or responseVersion." };
  }

  const intentResult = EditIntentV1Schema.safeParse(parsedJson);
  if (!intentResult.success) {
    return { ok: false, errorCode: ErrorCode.EDIT_SCHEMA_INVALID, message: "Edit intent response failed schema validation." };
  }

  return { ok: true, intent: intentResult.data };
}

export function parseProjectEditResponse(rawText: string):
  | { ok: true; edit: ProjectEditV1 }
  | { ok: false; errorCode: typeof ErrorCode.AI_RESPONSE_VERSION_MISSING | typeof ErrorCode.EDIT_SCHEMA_INVALID; message: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return { ok: false, errorCode: ErrorCode.EDIT_SCHEMA_INVALID, message: "Project edit response was not valid JSON." };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return { ok: false, errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING, message: "Project edit response is missing schemaVersion or responseVersion." };
  }

  const editResult = ProjectEditV1Schema.safeParse(parsedJson);
  if (!editResult.success) {
    return { ok: false, errorCode: ErrorCode.EDIT_SCHEMA_INVALID, message: "Project edit response failed schema validation." };
  }

  return { ok: true, edit: editResult.data };
}
