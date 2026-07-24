import { GenerationPlanV1Schema, type GenerationPlanV1 } from "@reactify/generation-contracts";

export interface PlanValidationResult {
  success: boolean;
  plan: GenerationPlanV1 | null;
  fieldErrors: Record<string, string>;
}

function collectEditableFieldErrors(plan: GenerationPlanV1): Record<string, string> {
  const fieldErrors: Record<string, string> = {};

  plan.components.forEach((component, index) => {
    if (!component.purpose.trim()) {
      fieldErrors[`components.${index}.purpose`] = "Purpose is required.";
    }
  });

  plan.files.forEach((file, index) => {
    if (!file.purpose.trim()) {
      fieldErrors[`files.${index}.purpose`] = "Purpose is required.";
    }
  });

  if (!plan.responsiveStrategy.trim()) {
    fieldErrors.responsiveStrategy = "Responsive strategy is required.";
  }

  if (!plan.accessibilityStrategy.trim()) {
    fieldErrors.accessibilityStrategy = "Accessibility strategy is required.";
  }

  return fieldErrors;
}

export function validateGenerationPlan(plan: GenerationPlanV1): PlanValidationResult {
  const result = GenerationPlanV1Schema.safeParse(plan);

  if (result.success) {
    const fieldErrors = collectEditableFieldErrors(result.data);

    if (Object.keys(fieldErrors).length > 0) {
      return {
        success: false,
        plan: null,
        fieldErrors,
      };
    }

    return {
      success: true,
      plan: result.data,
      fieldErrors: {},
    };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "plan";
    fieldErrors[key] = issue.message;
  }

  return {
    success: false,
    plan: null,
    fieldErrors,
  };
}
