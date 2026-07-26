import {
  AIResponseEnvelopeSchema,
  DesignAnalysisV1Schema,
  type DesignAnalysisV1,
} from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText } from "./extractJson.js";
import { formatZodValidationIssues, type ValidationIssueDetail } from "./formatValidationIssues.js";

export interface ParsedDesignAnalysisSuccess {
  ok: true;
  designAnalysis: DesignAnalysisV1;
}

export interface ParsedDesignAnalysisFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.AI_RESPONSE_VERSION_MISSING
    | typeof ErrorCode.ANALYSIS_SCHEMA_INVALID;
  message: string;
  /** Populated for schema failures so the log names the offending field. */
  validationIssues?: ValidationIssueDetail[];
}

export type ParsedDesignAnalysisResult =
  | ParsedDesignAnalysisSuccess
  | ParsedDesignAnalysisFailure;

export function parseDesignAnalysisResponse(rawText: string): ParsedDesignAnalysisResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return {
      ok: false,
      errorCode: ErrorCode.ANALYSIS_SCHEMA_INVALID,
      message: "Design analysis response was not valid JSON.",
    };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING,
      message: "Design analysis response is missing schemaVersion or responseVersion.",
    };
  }

  const analysisResult = DesignAnalysisV1Schema.safeParse(parsedJson);
  if (!analysisResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.ANALYSIS_SCHEMA_INVALID,
      message: "Design analysis response failed schema validation.",
      validationIssues: formatZodValidationIssues(analysisResult.error),
    };
  }

  return {
    ok: true,
    designAnalysis: analysisResult.data,
  };
}
