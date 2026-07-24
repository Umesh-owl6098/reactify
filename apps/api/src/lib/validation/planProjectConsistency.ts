import type { GeneratedProjectV1, GenerationPlanV1, ValidationIssue } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "./filePathValidator.js";

function issue(
  code: string,
  message: string,
  severity: "error" | "warning",
  filePath?: string,
): ValidationIssue {
  return { code, message, severity, filePath };
}

export function validatePlanProjectConsistency(
  plan: GenerationPlanV1,
  project: GeneratedProjectV1,
): { critical: ValidationIssue[]; warnings: ValidationIssue[] } {
  const critical: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const generatedPaths = new Set(project.files.map((file) => normalizeProjectPath(file.path)));
  const generatedComponentNames = new Set(project.components.map((component) => component.name));

  for (const plannedFile of plan.files) {
    if (!generatedPaths.has(normalizeProjectPath(plannedFile.path))) {
      critical.push(
        issue(
          "PLAN_PROJECT_MISMATCH",
          `Planned file "${plannedFile.path}" is missing from the generated project.`,
          "error",
          plannedFile.path,
        ),
      );
    }
  }

  for (const plannedComponent of plan.components) {
    if (!generatedComponentNames.has(plannedComponent.name)) {
      critical.push(
        issue(
          "PLAN_PROJECT_MISMATCH",
          `Planned component "${plannedComponent.name}" is missing from the generated project.`,
          "error",
        ),
      );
    }
  }

  const allowedDependencies = new Set([
    ...Object.keys(plan.dependencies),
    ...Object.keys(plan.devDependencies ?? {}),
  ]);

  for (const dependency of Object.keys(project.dependencies)) {
    if (!allowedDependencies.has(dependency)) {
      critical.push(
        issue(
          "PLAN_PROJECT_MISMATCH",
          `Generated dependency "${dependency}" was not declared in the confirmed plan.`,
          "error",
        ),
      );
    }
  }

  for (const dependency of Object.keys(project.devDependencies ?? {})) {
    if (!allowedDependencies.has(dependency)) {
      critical.push(
        issue(
          "PLAN_PROJECT_MISMATCH",
          `Generated devDependency "${dependency}" was not declared in the confirmed plan.`,
          "error",
        ),
      );
    }
  }

  const projectText = project.files.map((file) => file.content).join("\n").toLowerCase();
  if (plan.accessibilityStrategy && !projectText.includes("aria-") && !projectText.includes("role=")) {
    warnings.push(
      issue(
        "ACCESSIBILITY_STRATEGY_NOT_REFLECTED",
        "Generated project may not reflect the planned accessibility strategy.",
        "warning",
      ),
    );
  }

  if (plan.responsiveStrategy && !/(sm:|md:|lg:|xl:|@media|responsive|max-w-)/.test(projectText)) {
    warnings.push(
      issue(
        "RESPONSIVE_STRATEGY_NOT_REFLECTED",
        "Generated project may not reflect the planned responsive strategy.",
        "warning",
      ),
    );
  }

  return { critical, warnings };
}
