import type { GeneratedProjectV1, GenerationPlanV1, StaticValidationResult } from "@reactify/generation-contracts";
import { validatePlanProjectConsistency } from "./planProjectConsistency.js";
import {
  validateGeneratedProjectSchema,
  validateGeneratedProjectSyntax,
  validateLocalImportReferences,
} from "./projectValidators.js";
import { scanGeneratedSourceSafety } from "./sourceSafetyScanner.js";

export function runStaticProjectValidation(
  project: GeneratedProjectV1,
  plan?: GenerationPlanV1,
): StaticValidationResult {
  const errors = [
    ...validateGeneratedProjectSchema(project),
    ...validateGeneratedProjectSyntax(project),
    ...validateLocalImportReferences(project),
    ...scanGeneratedSourceSafety(project),
  ].filter((issue) => issue.severity === "error");

  const warnings = [];

  if (plan) {
    const consistency = validatePlanProjectConsistency(plan, project);
    errors.push(...consistency.critical);
    warnings.push(...consistency.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function runSchemaProjectValidation(project: GeneratedProjectV1) {
  const errors = validateGeneratedProjectSchema(project);
  return {
    valid: errors.length === 0,
    errors,
  };
}
