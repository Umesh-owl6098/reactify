export const ALLOWED_DEPENDENCIES = new Set([
  "react",
  "react-dom",
  "typescript",
  "vite",
  "@vitejs/plugin-react",
  "tailwindcss",
  "postcss",
  "autoprefixer",
]);

export interface DependencyValidationResult {
  ok: true;
}

export interface DependencyValidationFailure {
  ok: false;
  dependency: string;
}

export type ValidateDependenciesResult = DependencyValidationResult | DependencyValidationFailure;

export function validatePlanDependencies(plan: {
  dependencies: Record<string, string>;
  devDependencies?: Record<string, string>;
}): ValidateDependenciesResult {
  for (const dependency of Object.keys(plan.dependencies)) {
    if (!ALLOWED_DEPENDENCIES.has(dependency)) {
      return { ok: false, dependency };
    }
  }

  if (plan.devDependencies) {
    for (const dependency of Object.keys(plan.devDependencies)) {
      if (!ALLOWED_DEPENDENCIES.has(dependency)) {
        return { ok: false, dependency };
      }
    }
  }

  return { ok: true };
}
