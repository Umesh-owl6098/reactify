import {
  AIResponseEnvelopeSchema,
  GenerationPlanV1Schema,
  type GenerationPlanV1,
} from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { validatePlanDependencies } from "./allowlist.js";
import { extractJsonFromModelText } from "./extractJson.js";

export interface ParsedGenerationPlanSuccess {
  ok: true;
  generationPlan: GenerationPlanV1;
}

export interface ParsedGenerationPlanFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.AI_RESPONSE_VERSION_MISSING
    | typeof ErrorCode.PLAN_SCHEMA_INVALID
    | typeof ErrorCode.UNSAFE_DEPENDENCY;
  message: string;
}

export type ParsedGenerationPlanResult = ParsedGenerationPlanSuccess | ParsedGenerationPlanFailure;

export function parseGenerationPlanResponse(rawText: string): ParsedGenerationPlanResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return {
      ok: false,
      errorCode: ErrorCode.PLAN_SCHEMA_INVALID,
      message: "Generation plan response was not valid JSON.",
    };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING,
      message: "Generation plan response is missing schemaVersion or responseVersion.",
    };
  }

  const planResult = GenerationPlanV1Schema.safeParse(parsedJson);
  if (!planResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.PLAN_SCHEMA_INVALID,
      message: "Generation plan response failed schema validation.",
    };
  }

  const dependencyResult = validatePlanDependencies(planResult.data);
  if (!dependencyResult.ok) {
    return {
      ok: false,
      errorCode: ErrorCode.UNSAFE_DEPENDENCY,
      message: `Dependency "${dependencyResult.dependency}" is not allowlisted.`,
    };
  }

  return {
    ok: true,
    generationPlan: planResult.data,
  };
}
