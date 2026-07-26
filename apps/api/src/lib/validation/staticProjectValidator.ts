import type { GeneratedProjectV1, GenerationPlanV1, StaticValidationResult } from "@reactify/generation-contracts";
import { compileTailwindCss } from "../styling/compileTailwindCss.js";
import { analyzeTailwindUsage } from "../styling/tailwindClassScanner.js";
import {
  detectVerticalStackLayoutMismatch,
  validateTailwindCssCoverage,
  validateTailwindSetup,
} from "../styling/tailwindValidator.js";
import { validatePlanProjectConsistency } from "./planProjectConsistency.js";
import {
  validateGeneratedProjectSchema,
  validateGeneratedProjectSyntax,
  validateLocalImportReferences,
} from "./projectValidators.js";
import { scanGeneratedSourceSafety } from "./sourceSafetyScanner.js";

export async function runStaticProjectValidationAsync(
  project: GeneratedProjectV1,
  plan?: GenerationPlanV1,
): Promise<StaticValidationResult> {
  const errors = [
    ...validateGeneratedProjectSchema(project),
    ...validateGeneratedProjectSyntax(project),
    ...validateLocalImportReferences(project),
    ...scanGeneratedSourceSafety(project),
    ...validateTailwindSetup(project),
  ].filter((issue) => issue.severity === "error");

  const analysis = analyzeTailwindUsage(project);
  if (analysis.usesTailwind && errors.length === 0) {
    const compiled = await compileTailwindCss(project);
    if (!compiled.ok) {
      errors.push({
        code: "TAILWIND_COMPILE_FAILED",
        message: compiled.message,
        severity: "error",
      });
    } else {
      errors.push(
        ...validateTailwindCssCoverage(analysis.utilityClasses.slice(0, 40), compiled.css),
        ...detectVerticalStackLayoutMismatch({
          utilityClasses: analysis.utilityClasses,
          compiledCss: compiled.css,
        }),
      );
    }
  }

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

export function runStaticProjectValidation(
  project: GeneratedProjectV1,
  plan?: GenerationPlanV1,
): StaticValidationResult {
  const errors = [
    ...validateGeneratedProjectSchema(project),
    ...validateGeneratedProjectSyntax(project),
    ...validateLocalImportReferences(project),
    ...scanGeneratedSourceSafety(project),
    ...validateTailwindSetup(project),
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
