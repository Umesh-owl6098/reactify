import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "../validation/filePathValidator.js";
import { analyzeTailwindUsage } from "./tailwindClassScanner.js";
import {
  TAILWIND_V3_DEV_DEPENDENCIES,
  buildTailwindScaffold,
  usesTailwindV4Syntax,
} from "./tailwindScaffold.js";

function upsertFile(
  files: GeneratedProjectV1["files"],
  path: string,
  content: string,
  language: GeneratedProjectV1["files"][number]["language"],
  purpose: string,
): GeneratedProjectV1["files"] {
  const normalizedPath = normalizeProjectPath(path);
  const existingIndex = files.findIndex((file) => normalizeProjectPath(file.path) === normalizedPath);

  if (existingIndex >= 0) {
    const next = [...files];
    next[existingIndex] = {
      ...next[existingIndex]!,
      content,
    };
    return next;
  }

  return [
    ...files,
    {
      path: normalizedPath,
      language,
      content,
      purpose,
    },
  ];
}

/** Leading major version of a semver range, e.g. "^8.5.1" -> 8. */
function declaredMajor(range: string): number | null {
  const match = /(\d+)/.exec(range.trim());
  return match?.[1] ? Number(match[1]) : null;
}

function sameDependencyMap(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  const normalize = (value: Record<string, string> | undefined) =>
    JSON.stringify(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  return normalize(left) === normalize(right);
}

function ensureStylesheetDirectives(content: string): { content: string; changed: boolean } {
  if (content.includes("@tailwind base")) {
    return { content, changed: false };
  }

  if (content.includes('@import "tailwindcss"')) {
    return { content, changed: false };
  }

  const directives = ["@tailwind base;", "@tailwind components;", "@tailwind utilities;", ""];
  return {
    content: `${directives.join("\n")}${content}`,
    changed: true,
  };
}

function ensureMainImportsStylesheet(project: GeneratedProjectV1): { files: GeneratedProjectV1["files"]; changed: boolean } {
  const mainPath = project.files.find((file) => /src\/main\.(tsx|jsx)$/.test(normalizeProjectPath(file.path)));
  if (!mainPath) {
    return { files: project.files, changed: false };
  }

  if (/import\s+["']\.\/index\.css["']/.test(mainPath.content)) {
    return { files: project.files, changed: false };
  }

  const updatedContent = mainPath.content.replace(
    /(import\s+App\s+from\s+["']\.\/App(?:\.tsx|\.jsx)?["'];?\n)/,
    `$1import "./index.css";\n`,
  );

  if (updatedContent === mainPath.content) {
    return { files: project.files, changed: false };
  }

  return {
    files: upsertFile(project.files, mainPath.path, updatedContent, mainPath.language, mainPath.purpose),
    changed: true,
  };
}

export function normalizeProjectStyling(project: GeneratedProjectV1): {
  project: GeneratedProjectV1;
  applied: string[];
} {
  const applied: string[] = [];
  const analysis = analyzeTailwindUsage(project);

  if (!analysis.usesTailwind) {
    return { project, applied };
  }

  if (usesTailwindV4Syntax(project)) {
    applied.push("tailwind_v4_detected_left_unchanged");
    return { project, applied };
  }

  let nextProject: GeneratedProjectV1 = {
    ...project,
    devDependencies: {
      ...(project.devDependencies ?? {}),
    },
    files: [...project.files],
  };

  // Only correct versions that target the wrong major. Rewriting an already
  // compatible range (e.g. postcss ^8.5.1 -> ^8.4.49) churns package.json and
  // changes the project hash for no functional gain.
  for (const [name, version] of Object.entries(TAILWIND_V3_DEV_DEPENDENCIES)) {
    const declared = nextProject.devDependencies?.[name];
    if (declared && declaredMajor(declared) === declaredMajor(version)) {
      continue;
    }

    nextProject.devDependencies = {
      ...nextProject.devDependencies,
      [name]: version,
    };
    applied.push(`dev_dependency_${name}_ensured`);
  }

  const scaffold = buildTailwindScaffold(nextProject);

  const postcssPath = "postcss.config.js";
  const tailwindPath = "tailwind.config.js";
  const existingPostcss = nextProject.files.find((file) => normalizeProjectPath(file.path) === postcssPath);
  const existingTailwind = nextProject.files.find((file) => normalizeProjectPath(file.path) === tailwindPath);

  if (!existingPostcss || !existingPostcss.content.includes("tailwindcss")) {
    nextProject = {
      ...nextProject,
      files: upsertFile(
        nextProject.files,
        postcssPath,
        scaffold.postcssConfig,
        "js",
        "PostCSS configuration for Tailwind CSS",
      ),
    };
    applied.push("postcss_config_injected");
  }

  if (!existingTailwind || !existingTailwind.content.includes("content:")) {
    nextProject = {
      ...nextProject,
      files: upsertFile(
        nextProject.files,
        tailwindPath,
        scaffold.tailwindConfig,
        "js",
        "Tailwind CSS configuration",
      ),
    };
    applied.push("tailwind_config_injected");
  }

  const stylesheet = nextProject.files.find((file) => file.path.endsWith(".css"));
  if (stylesheet) {
    const ensured = ensureStylesheetDirectives(stylesheet.content);
    if (ensured.changed) {
      nextProject = {
        ...nextProject,
        files: upsertFile(nextProject.files, stylesheet.path, ensured.content, stylesheet.language, stylesheet.purpose),
      };
      applied.push("tailwind_directives_ensured");
    }
  }

  const mainResult = ensureMainImportsStylesheet(nextProject);
  if (mainResult.changed) {
    nextProject = { ...nextProject, files: mainResult.files };
    applied.push("main_stylesheet_import_ensured");
  }

  const packageFile = nextProject.files.find((file) => normalizeProjectPath(file.path) === "package.json");
  if (packageFile) {
    try {
      const parsed = JSON.parse(packageFile.content) as {
        name?: string;
        private?: boolean;
        type?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const mergedDevDependencies = {
        ...(parsed.devDependencies ?? {}),
        ...(nextProject.devDependencies ?? {}),
      };

      const normalizedPackage = {
        ...parsed,
        dependencies: nextProject.dependencies,
        devDependencies: mergedDevDependencies,
      };

      const packageContent = `${JSON.stringify(normalizedPackage, null, 2)}\n`;
      const dependenciesChanged =
        !sameDependencyMap(parsed.devDependencies, mergedDevDependencies) ||
        !sameDependencyMap(parsed.dependencies, nextProject.dependencies);

      if (dependenciesChanged) {
        nextProject = {
          ...nextProject,
          devDependencies: mergedDevDependencies,
          files: upsertFile(
            nextProject.files,
            packageFile.path,
            packageContent,
            packageFile.language,
            packageFile.purpose,
          ),
        };
        applied.push("package_json_tailwind_dependencies_synced");
      }
    } catch {
      // package.json validation happens elsewhere
    }
  }

  return {
    project: nextProject,
    applied: [...new Set(applied)],
  };
}
