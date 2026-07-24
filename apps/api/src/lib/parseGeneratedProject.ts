import {
  AIResponseEnvelopeSchema,
  GeneratedProjectV1Schema,
  type GeneratedProjectV1,
  type GenerationPlanV1,
} from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { extractJsonFromModelText } from "./extractJson.js";
import { validateDependencyRecords } from "./validation/dependencyValidator.js";
import { findDuplicateNormalizedPaths, validateProjectFilePath } from "./validation/filePathValidator.js";
import { validatePlanProjectConsistency } from "./validation/planProjectConsistency.js";
import { validateRequiredProjectFiles } from "./validation/requiredFilesValidator.js";
import { scanGeneratedSourceSafety } from "./validation/sourceSafetyScanner.js";

export interface ParsedGeneratedProjectSuccess {
  ok: true;
  generatedProject: GeneratedProjectV1;
}

export interface ParsedGeneratedProjectFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.AI_RESPONSE_VERSION_MISSING
    | typeof ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID
    | typeof ErrorCode.UNSAFE_DEPENDENCY
    | typeof ErrorCode.UNSAFE_FILE_PATH
    | typeof ErrorCode.UNSAFE_SOURCE_CODE
    | typeof ErrorCode.PLAN_PROJECT_MISMATCH;
  message: string;
}

export type ParsedGeneratedProjectResult =
  | ParsedGeneratedProjectSuccess
  | ParsedGeneratedProjectFailure;

export function parseGeneratedProjectResponse(
  rawText: string,
  plan?: GenerationPlanV1,
): ParsedGeneratedProjectResult {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(extractJsonFromModelText(rawText));
  } catch {
    return {
      ok: false,
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      message: "Generated project response was not valid JSON.",
    };
  }

  const envelopeResult = AIResponseEnvelopeSchema.safeParse(parsedJson);
  if (!envelopeResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.AI_RESPONSE_VERSION_MISSING,
      message: "Generated project response is missing schemaVersion or responseVersion.",
    };
  }

  const projectResult = GeneratedProjectV1Schema.safeParse(parsedJson);
  if (!projectResult.success) {
    return {
      ok: false,
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      message: "Generated project response failed schema validation.",
    };
  }

  const duplicate = findDuplicateNormalizedPaths(projectResult.data.files.map((file) => file.path));
  if (duplicate) {
    return {
      ok: false,
      errorCode: ErrorCode.UNSAFE_FILE_PATH,
      message: `Duplicate normalized path "${duplicate}".`,
    };
  }

  for (const file of projectResult.data.files) {
    const pathResult = validateProjectFilePath(file.path);
    if (!pathResult.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.UNSAFE_FILE_PATH,
        message: pathResult.message,
      };
    }
  }

  const dependencyResult = validateDependencyRecords({
    dependencies: projectResult.data.dependencies,
    devDependencies: projectResult.data.devDependencies,
  });
  if (!dependencyResult.ok) {
    const unsafe = dependencyResult.issues.find((issue) => issue.code === "UNSAFE_DEPENDENCY");
    return {
      ok: false,
      errorCode: ErrorCode.UNSAFE_DEPENDENCY,
      message: unsafe?.message ?? "Generated project contains unsafe dependencies.",
    };
  }

  const requiredIssues = validateRequiredProjectFiles(projectResult.data);
  if (requiredIssues.length > 0) {
    return {
      ok: false,
      errorCode: ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID,
      message: requiredIssues[0]!.message,
    };
  }

  const safetyIssues = scanGeneratedSourceSafety(projectResult.data);
  if (safetyIssues.length > 0) {
    return {
      ok: false,
      errorCode: ErrorCode.UNSAFE_SOURCE_CODE,
      message: safetyIssues[0]!.message,
    };
  }

  if (plan) {
    const consistency = validatePlanProjectConsistency(plan, projectResult.data);
    if (consistency.critical.length > 0) {
      return {
        ok: false,
        errorCode: ErrorCode.PLAN_PROJECT_MISMATCH,
        message: consistency.critical[0]!.message,
      };
    }
  }

  return {
    ok: true,
    generatedProject: projectResult.data,
  };
}
