import {
  AIResponseEnvelopeSchema,
  GeneratedProjectV1Schema,
  type GeneratedProjectV1,
  type GenerationPlanV1,
} from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText, isLikelyTruncatedJson } from "./extractJson.js";
import {
  formatZodValidationIssues,
  summarizeInvalidShape,
  truncateForSafeLog,
  type ValidationIssueDetail,
} from "./formatValidationIssues.js";
import {
  normalizeGeneratedProjectPayload,
  stripNullStructuredFields,
} from "./normalizeGeneratedProject.js";
import { normalizeProjectStyling } from "./styling/normalizeProjectStyling.js";
import { validateDependencyRecords } from "./validation/dependencyValidator.js";
import { findDuplicateNormalizedPaths, validateProjectFilePath } from "./validation/filePathValidator.js";
import { validatePlanProjectConsistency } from "./validation/planProjectConsistency.js";
import { validateRequiredProjectFiles } from "./validation/requiredFilesValidator.js";
import { scanGeneratedSourceSafety } from "./validation/sourceSafetyScanner.js";

export interface ParsedGeneratedProjectSuccess {
  ok: true;
  generatedProject: GeneratedProjectV1;
  normalizationApplied: string[];
}

export interface ParsedGeneratedProjectFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.AI_RESPONSE_VERSION_MISSING
    | typeof ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID
    | typeof ErrorCode.GENERATED_PROJECT_MISSING_REQUIRED_FILES
    | typeof ErrorCode.GENERATED_PROJECT_UNSAFE_PATH
    | typeof ErrorCode.GENERATED_PROJECT_TOKEN_TRUNCATED
    | typeof ErrorCode.PROVIDER_RESPONSE_NOT_JSON
    | typeof ErrorCode.UNSAFE_DEPENDENCY
    | typeof ErrorCode.UNSAFE_FILE_PATH
    | typeof ErrorCode.UNSAFE_SOURCE_CODE
    | typeof ErrorCode.PLAN_PROJECT_MISMATCH;
  message: string;
  validationIssues: ValidationIssueDetail[];
  normalizationApplied: string[];
  invalidShape?: Record<string, unknown>;
}

export type ParsedGeneratedProjectResult =
  | ParsedGeneratedProjectSuccess
  | ParsedGeneratedProjectFailure;

export type ParsedGeneratedProjectDetailedResult = ParsedGeneratedProjectResult;

function failure(
  errorCode: ParsedGeneratedProjectFailure["errorCode"],
  message: string,
  options: {
    validationIssues?: ValidationIssueDetail[];
    normalizationApplied?: string[];
    invalidShape?: Record<string, unknown>;
  } = {},
): ParsedGeneratedProjectFailure {
  return {
    ok: false,
    errorCode,
    message,
    validationIssues: options.validationIssues ?? [],
    normalizationApplied: options.normalizationApplied ?? [],
    invalidShape: options.invalidShape,
  };
}

export function parseGeneratedProjectResponse(
  rawText: string,
  plan?: GenerationPlanV1,
): ParsedGeneratedProjectResult {
  const detailed = parseGeneratedProjectResponseDetailed(rawText, plan);
  if (detailed.ok) {
    return detailed;
  }

  return {
    ok: false,
    errorCode: detailed.errorCode,
    message: detailed.message,
    validationIssues: detailed.validationIssues,
    normalizationApplied: detailed.normalizationApplied,
    invalidShape: detailed.invalidShape,
  };
}

export function parseGeneratedProjectResponseDetailed(
  rawText: string,
  plan?: GenerationPlanV1,
): ParsedGeneratedProjectDetailedResult {
  let parsedJson: unknown;
  const extracted = extractJsonFromModelText(rawText);

  try {
    parsedJson = JSON.parse(extracted);
  } catch (error) {
    if (isLikelyTruncatedJson(rawText, error)) {
      return failure(ErrorCode.GENERATED_PROJECT_TOKEN_TRUNCATED, "Generated project response appears truncated.", {
        validationIssues: [
          {
            path: "(root)",
            code: "json_truncated",
            message: error instanceof Error ? error.message : "Invalid JSON",
          },
        ],
        invalidShape: { rawLength: rawText.length, tail: truncateForSafeLog(rawText.slice(-120), 120) },
      });
    }

    return failure(ErrorCode.PROVIDER_RESPONSE_NOT_JSON, "Generated project response was not valid JSON.", {
      validationIssues: [
        {
          path: "(root)",
          code: "json_parse_error",
          message: error instanceof Error ? error.message : "Invalid JSON",
        },
      ],
      invalidShape: { rawPreview: truncateForSafeLog(rawText, 200) },
    });
  }

  const normalized = normalizeGeneratedProjectPayload(parsedJson);
  const schemaInput = stripNullStructuredFields(normalized.value);

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(schemaInput);
  if (!envelopeResult.success) {
    return failure(
      ErrorCode.AI_RESPONSE_VERSION_MISSING,
      "Generated project response is missing schemaVersion or responseVersion.",
      {
        validationIssues: formatZodValidationIssues(envelopeResult.error),
        normalizationApplied: normalized.applied,
        invalidShape: summarizeInvalidShape(schemaInput),
      },
    );
  }

  const projectResult = GeneratedProjectV1Schema.safeParse(schemaInput);
  if (!projectResult.success) {
    return failure(
      ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      buildSchemaInvalidMessage(formatZodValidationIssues(projectResult.error)),
      {
        validationIssues: formatZodValidationIssues(projectResult.error),
        normalizationApplied: normalized.applied,
        invalidShape: summarizeInvalidShape(schemaInput),
      },
    );
  }

  const duplicate = findDuplicateNormalizedPaths(projectResult.data.files.map((file) => file.path));
  if (duplicate) {
    return failure(ErrorCode.GENERATED_PROJECT_UNSAFE_PATH, `Duplicate normalized path "${duplicate}".`, {
      validationIssues: [
        {
          path: "files",
          code: "duplicate_path",
          message: `Duplicate normalized path "${duplicate}".`,
        },
      ],
      normalizationApplied: normalized.applied,
    });
  }

  for (const file of projectResult.data.files) {
    const pathResult = validateProjectFilePath(file.path);
    if (!pathResult.ok) {
      return failure(ErrorCode.GENERATED_PROJECT_UNSAFE_PATH, pathResult.message, {
        validationIssues: [
          {
            path: `files.${file.path}`,
            code: "unsafe_path",
            message: pathResult.message,
          },
        ],
        normalizationApplied: normalized.applied,
      });
    }
  }

  const dependencyResult = validateDependencyRecords({
    dependencies: projectResult.data.dependencies,
    devDependencies: projectResult.data.devDependencies,
  });
  if (!dependencyResult.ok) {
    const unsafe = dependencyResult.issues.find((issue) => issue.code === "UNSAFE_DEPENDENCY");
    return failure(ErrorCode.UNSAFE_DEPENDENCY, unsafe?.message ?? "Generated project contains unsafe dependencies.", {
      validationIssues: dependencyResult.issues.map((issue) => ({
        path: "dependencies",
        code: issue.code,
        message: issue.message,
      })),
      normalizationApplied: normalized.applied,
    });
  }

  const requiredIssues = validateRequiredProjectFiles(projectResult.data);
  if (requiredIssues.length > 0) {
    return failure(
      ErrorCode.GENERATED_PROJECT_MISSING_REQUIRED_FILES,
      requiredIssues[0]!.message,
      {
        validationIssues: requiredIssues.map((issue) => ({
          path: issue.filePath ?? "files",
          code: issue.code,
          message: issue.message,
        })),
        normalizationApplied: normalized.applied,
      },
    );
  }

  const safetyIssues = scanGeneratedSourceSafety(projectResult.data);
  if (safetyIssues.length > 0) {
    return failure(ErrorCode.UNSAFE_SOURCE_CODE, safetyIssues[0]!.message, {
      validationIssues: safetyIssues.map((issue) => ({
        path: issue.filePath ?? "files",
        code: issue.code,
        message: issue.message,
      })),
      normalizationApplied: normalized.applied,
    });
  }

  if (plan) {
    const consistency = validatePlanProjectConsistency(plan, projectResult.data);
    if (consistency.critical.length > 0) {
      return failure(ErrorCode.PLAN_PROJECT_MISMATCH, consistency.critical[0]!.message, {
        validationIssues: consistency.critical.map((issue) => ({
          path: issue.filePath ?? "project",
          code: issue.code,
          message: issue.message,
        })),
        normalizationApplied: normalized.applied,
      });
    }
  }

  const styled = normalizeProjectStyling(projectResult.data);

  return {
    ok: true,
    generatedProject: styled.project,
    normalizationApplied: [...normalized.applied, ...styled.applied],
  };
}

function buildSchemaInvalidMessage(issues: ValidationIssueDetail[]): string {
  const first = issues[0];
  if (!first) {
    return "Generated project response failed schema validation.";
  }
  const detail = first.expected
    ? `${first.path}: expected ${first.expected}, received ${first.received ?? "invalid value"}`
    : `${first.path}: ${first.message}`;
  return `Generated project response failed schema validation (${detail}).`;
}

const REPAIRABLE_GENERATED_PROJECT_ERROR_CODES = [
  ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
  ErrorCode.GENERATED_PROJECT_MISSING_REQUIRED_FILES,
  ErrorCode.PROVIDER_RESPONSE_NOT_JSON,
  ErrorCode.GENERATED_PROJECT_TOKEN_TRUNCATED,
  ErrorCode.AI_RESPONSE_VERSION_MISSING,
] as const;

export function isRepairableGeneratedProjectFailure(
  result: ParsedGeneratedProjectFailure,
): boolean {
  return (REPAIRABLE_GENERATED_PROJECT_ERROR_CODES as readonly string[]).includes(result.errorCode);
}

export function buildGeneratedProjectValidationLogFields(
  result: ParsedGeneratedProjectFailure,
  context: {
    generationId: string;
    jobId?: string;
    model: string;
    rawText: string;
  },
): Record<string, unknown> {
  return {
    generationId: context.generationId,
    jobId: context.jobId,
    model: context.model,
    errorCode: result.errorCode,
    message: result.message,
    validationIssues: result.validationIssues.slice(0, 10),
    normalizationApplied: result.normalizationApplied,
    invalidShape: result.invalidShape,
    responsePreview: truncateForSafeLog(context.rawText, 500),
  };
}
