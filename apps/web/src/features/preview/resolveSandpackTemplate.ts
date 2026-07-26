import type { GeneratedProjectV1 } from "@reactify/generation-contracts";

/**
 * Presets understood by the Sandpack v2 bundler. Anything else makes the bundler
 * log `Unknown preset <x>, falling back to React`, which hides real configuration
 * mistakes behind a silent fallback.
 */
export const SUPPORTED_SANDPACK_PRESETS = ["react", "solid"] as const;

export type SandpackPreset = (typeof SUPPORTED_SANDPACK_PRESETS)[number];

export interface ResolvedSandpackTemplate {
  /** Bundler preset sent to the Sandpack v2 bundler. */
  preset: SandpackPreset;
  /** Absolute (leading slash) path of the module the bundler should execute first. */
  entry: string;
  /** Absolute (leading slash) path of the HTML document. */
  htmlEntry: string;
  /** Runtime dependencies installed by the bundler. */
  dependencies: Record<string, string>;
  /** Toolchain detected from the generated project, for diagnostics only. */
  toolchain: "vite" | "create-react-app" | "unknown";
  typescript: boolean;
}

export interface SandpackTemplateResolutionError {
  code:
    | "missing_entry_file"
    | "missing_html_entry"
    | "missing_react_dependency"
    | "invalid_react_version"
    | "unsupported_preset"
    | "missing_compiled_stylesheet"
    | "invalid_file_path";
  message: string;
}

export type SandpackTemplateResolution =
  | { ok: true; template: ResolvedSandpackTemplate }
  | { ok: false; errors: SandpackTemplateResolutionError[] };

export interface ResolveSandpackTemplateOptions {
  /** Server-compiled Tailwind stylesheet. Required when the project uses Tailwind. */
  compiledStylesheet?: string | null;
  /** Explicit preset request (e.g. from generated metadata). Validated, never silently coerced. */
  requestedPreset?: string | null;
}

const RUNTIME_DEPENDENCIES = ["react", "react-dom"] as const;
const VERSION_RE = /^[\^~]?\d+(\.\d+)*(\.[\dx*]+)?(-[0-9A-Za-z.-]+)?$/;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function toAbsolute(path: string): string {
  return `/${normalizePath(path)}`;
}

function readPackageJson(project: GeneratedProjectV1): Record<string, unknown> | null {
  const file = project.files.find((entry) => normalizePath(entry.path) === "package.json");
  if (!file) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(file.content);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function detectToolchain(project: GeneratedProjectV1): ResolvedSandpackTemplate["toolchain"] {
  const paths = new Set(project.files.map((file) => normalizePath(file.path)));
  const packageJson = readPackageJson(project);
  const devDependencies = {
    ...(project.devDependencies ?? {}),
    ...((packageJson?.devDependencies as Record<string, string> | undefined) ?? {}),
  };
  const dependencies = {
    ...project.dependencies,
    ...((packageJson?.dependencies as Record<string, string> | undefined) ?? {}),
  };

  const hasViteConfig = paths.has("vite.config.ts") || paths.has("vite.config.js");
  if (hasViteConfig || "vite" in devDependencies || "vite" in dependencies) {
    return "vite";
  }

  if ("react-scripts" in devDependencies || "react-scripts" in dependencies) {
    return "create-react-app";
  }

  return "unknown";
}

function isTypeScriptProject(project: GeneratedProjectV1): boolean {
  return project.files.some((file) => {
    const path = normalizePath(file.path);
    return path === "tsconfig.json" || path.endsWith(".ts") || path.endsWith(".tsx");
  });
}

function usesTailwind(project: GeneratedProjectV1): boolean {
  return project.files.some((file) => {
    const path = normalizePath(file.path);
    if (path === "tailwind.config.js" || path === "tailwind.config.ts" || path === "tailwind.config.cjs") {
      return true;
    }
    return path.endsWith(".css") && /@tailwind\s+(base|components|utilities)/.test(file.content);
  });
}

/**
 * Deterministically map a generated project onto a Sandpack configuration the
 * bundler actually supports. Returns every blocking problem instead of falling
 * back to a preset that only appears to work.
 */
export function resolveSandpackTemplate(
  project: GeneratedProjectV1,
  options: ResolveSandpackTemplateOptions = {},
): SandpackTemplateResolution {
  const errors: SandpackTemplateResolutionError[] = [];

  if (options.requestedPreset && !SUPPORTED_SANDPACK_PRESETS.includes(options.requestedPreset as SandpackPreset)) {
    errors.push({
      code: "unsupported_preset",
      message: `Sandpack preset "${options.requestedPreset}" is not supported by the bundler. Supported presets: ${SUPPORTED_SANDPACK_PRESETS.join(", ")}.`,
    });
  }

  const paths = new Set(project.files.map((file) => normalizePath(file.path)));

  for (const file of project.files) {
    const normalized = normalizePath(file.path);
    if (normalized.length === 0 || normalized.includes("..")) {
      errors.push({
        code: "invalid_file_path",
        message: `Generated file path "${file.path}" cannot be mapped onto a Sandpack path.`,
      });
    }
  }

  const entry = normalizePath(project.entryFile);
  if (!entry || !paths.has(entry)) {
    errors.push({
      code: "missing_entry_file",
      message: `Entry file "${project.entryFile}" is not present in the generated project.`,
    });
  }

  if (!paths.has("index.html")) {
    errors.push({
      code: "missing_html_entry",
      message: "index.html is missing. Sandpack needs an HTML document to mount the generated app.",
    });
  }

  const packageJson = readPackageJson(project);
  const declaredDependencies: Record<string, string> = {
    ...((packageJson?.dependencies as Record<string, string> | undefined) ?? {}),
    ...project.dependencies,
  };

  const dependencies: Record<string, string> = {};
  for (const name of RUNTIME_DEPENDENCIES) {
    const version = declaredDependencies[name];
    if (!version) {
      errors.push({
        code: "missing_react_dependency",
        message: `Dependency "${name}" is missing from the generated project.`,
      });
      continue;
    }
    if (!VERSION_RE.test(version.trim()) && version.trim() !== "latest") {
      errors.push({
        code: "invalid_react_version",
        message: `Dependency "${name}" has an unusable version range "${version}".`,
      });
      continue;
    }
    dependencies[name] = version.trim();
  }

  if (usesTailwind(project) && !options.compiledStylesheet) {
    errors.push({
      code: "missing_compiled_stylesheet",
      message:
        "The project uses Tailwind but no server-compiled stylesheet was supplied. Sandpack cannot run PostCSS in the browser.",
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    template: {
      preset: "react",
      entry: toAbsolute(entry),
      htmlEntry: "/index.html",
      dependencies,
      toolchain: detectToolchain(project),
      typescript: isTypeScriptProject(project),
    },
  };
}

export function formatSandpackTemplateErrors(errors: SandpackTemplateResolutionError[]): string {
  return errors.map((error) => error.message).join(" ");
}
