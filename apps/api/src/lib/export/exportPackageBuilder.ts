import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import type { ExportManifest } from "@reactify/generation-contracts";
import { validateDependencyRecords } from "../validation/dependencyValidator.js";
import { validateProjectFilePath } from "../validation/filePathValidator.js";
import { scanSourceSafety } from "../validation/sourceSafetyScanner.js";
import { computeContentHash } from "./exportUtils.js";
import { normalizeProjectPath } from "../validation/filePathValidator.js";

const BLOCKED_PATH_PREFIXES = [
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".cache/",
  ".turbo/",
  "storage/",
];

const BLOCKED_PATHS = new Set([".env", ".env.local", ".env.development", ".env.production"]);

export interface PreparedExportFile {
  path: string;
  content: string;
  sizeBytes: number;
  contentHash: string;
}

export interface PreparedExportPackage {
  files: PreparedExportFile[];
  totalSizeBytes: number;
}

export function prepareProjectFiles(
  project: GeneratedProjectV1,
  limits: { maxFiles: number; maxFileBytes: number; maxTotalBytes: number },
): { ok: true; package: PreparedExportPackage } | { ok: false; message: string } {
  const prepared: PreparedExportFile[] = [];
  let totalSizeBytes = 0;
  const seenPaths = new Set<string>();

  const sortedFiles = [...project.files].sort((left, right) =>
    normalizeProjectPath(left.path).localeCompare(normalizeProjectPath(right.path)),
  );

  for (const file of sortedFiles) {
    const pathResult = validateProjectFilePath(file.path);
    if (!pathResult.ok) {
      return { ok: false, message: pathResult.message };
    }

    const normalizedPath = pathResult.normalizedPath;
    if (seenPaths.has(normalizedPath)) {
      return { ok: false, message: `Duplicate export path "${normalizedPath}".` };
    }
    seenPaths.add(normalizedPath);

    if (BLOCKED_PATHS.has(normalizedPath) || BLOCKED_PATH_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
      return { ok: false, message: `Blocked export path "${normalizedPath}".` };
    }

    const sizeBytes = Buffer.byteLength(file.content, "utf8");
    if (sizeBytes > limits.maxFileBytes) {
      return { ok: false, message: `File "${normalizedPath}" exceeds export size limit.` };
    }

    totalSizeBytes += sizeBytes;
    if (totalSizeBytes > limits.maxTotalBytes) {
      return { ok: false, message: "Export exceeds total uncompressed size limit." };
    }

    const safety = scanSourceSafety(file.content);
    if (!safety.ok) {
      return { ok: false, message: safety.message };
    }

    prepared.push({
      path: normalizedPath,
      content: file.content,
      sizeBytes,
      contentHash: computeContentHash(file.content),
    });
  }

  if (prepared.length > limits.maxFiles) {
    return { ok: false, message: "Export exceeds maximum file count." };
  }

  return { ok: true, package: { files: prepared, totalSizeBytes } };
}

export function buildExportManifest(input: {
  exportId: string;
  generationId: string;
  versionId: string;
  versionNumber: number;
  projectName: string;
  projectHash: string;
  exportedAt: string;
  files: PreparedExportFile[];
  totalSizeBytes: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}): ExportManifest {
  return {
    schemaVersion: "1",
    exportId: input.exportId,
    generationId: input.generationId,
    versionId: input.versionId,
    versionNumber: input.versionNumber,
    projectName: input.projectName,
    projectHash: input.projectHash,
    exportedAt: input.exportedAt,
    fileCount: input.files.length,
    totalSizeBytes: input.totalSizeBytes,
    validationStatus: {
      schema: "passed",
      static: "passed",
      compilation: "passed",
      runtime: "passed",
    },
    files: input.files.map((file) => ({
      path: file.path,
      sizeBytes: file.sizeBytes,
      contentHash: file.contentHash,
    })),
    dependencies: input.dependencies,
    devDependencies: input.devDependencies,
  };
}

export function validateExportPackageJson(content: string): { ok: true; parsed: Record<string, unknown> } | { ok: false; message: string } {
  let parsed: {
    name?: string;
    private?: boolean;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return { ok: false, message: "package.json is not valid JSON." };
  }

  if (!parsed.scripts?.dev || !parsed.scripts?.build || !parsed.scripts?.preview) {
    return { ok: false, message: "package.json must include dev, build, and preview scripts." };
  }

  const dependencyValidation = validateDependencyRecords({
    dependencies: parsed.dependencies ?? {},
    devDependencies: parsed.devDependencies ?? {},
  });

  if (!dependencyValidation.ok) {
    return {
      ok: false,
      message: dependencyValidation.issues[0]?.message ?? "package.json dependencies are invalid.",
    };
  }

  for (const group of [parsed.dependencies ?? {}, parsed.devDependencies ?? {}]) {
    for (const [name, version] of Object.entries(group)) {
      if (/file:|git:|https:|http:|\$\(/.test(version)) {
        return { ok: false, message: `Dependency "${name}" uses a disallowed version source.` };
      }
    }
  }

  return { ok: true, parsed: parsed as Record<string, unknown> };
}

export function normalizeExportPackageJson(
  project: GeneratedProjectV1,
  safeProjectName: string,
): { ok: true; content: string } | { ok: false; message: string } {
  const packageFile = project.files.find((file) => normalizeProjectPath(file.path) === "package.json");
  if (!packageFile) {
    return { ok: false, message: "package.json is missing from generated project." };
  }

  let parsed: {
    name?: string;
    private?: boolean;
    type?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  try {
    parsed = JSON.parse(packageFile.content) as typeof parsed;
  } catch {
    return { ok: false, message: "package.json is not valid JSON." };
  }

  const normalized = {
    name: safeProjectName,
    private: true,
    type: parsed.type ?? "module",
    scripts: {
      dev: parsed.scripts?.dev ?? "vite",
      build: parsed.scripts?.build ?? "tsc && vite build",
      preview: parsed.scripts?.preview ?? "vite preview",
    },
    dependencies: project.dependencies,
    devDependencies: project.devDependencies ?? {},
  };

  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  const validation = validateExportPackageJson(content);
  if (!validation.ok) {
    return validation;
  }

  return { ok: true, content };
}

export const EXPORT_GITIGNORE = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".DS_Store",
  ".env",
  ".env.*",
  "*.log",
].join("\n");

export function buildExportReadme(input: {
  projectName: string;
  summary: string;
  generationId: string;
  versionNumber: number;
  projectHash: string;
  components: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  warnings: string[];
  filePaths: string[];
}): string {
  const shortGenerationId = `${input.generationId.slice(0, 8)}…`;
  const shortHash = `${input.projectHash.slice(0, 12)}…`;

  return [
    `# ${input.projectName}`,
    "",
    input.summary,
    "",
    "> Generated by [Reactify](https://github.com/) from a validated screenshot-to-code workflow.",
    "",
    "## Requirements",
    "",
    "- Node.js 20 or later",
    "- npm, pnpm, or yarn",
    "",
    "## Getting started",
    "",
    "```bash",
    "npm install",
    "npm run dev",
    "```",
    "",
    "## Scripts",
    "",
    "- `npm run dev` — start the Vite development server",
    "- `npm run build` — create a production build",
    "- `npm run preview` — preview the production build locally",
    "",
    "## Project structure",
    "",
    ...input.filePaths.slice(0, 12).map((path) => `- \`${path}\``),
    "",
    "## Components",
    "",
    ...(input.components.length > 0
      ? input.components.map((component) => `- ${component}`)
      : ["- App"]),
    "",
    "## Dependencies",
    "",
    ...Object.entries(input.dependencies).map(([name, version]) => `- ${name}: ${version}`),
    "",
    "## Dev dependencies",
    "",
    ...Object.entries(input.devDependencies).map(([name, version]) => `- ${name}: ${version}`),
    "",
    "## Validation status",
    "",
    "- Schema validation: passed",
    "- Static validation: passed",
    "- Sandbox compilation: passed",
    "- Runtime validation: passed",
    "",
    "## Reactify metadata",
    "",
    `- Generation ID: \`${shortGenerationId}\``,
    `- Exported version: v${input.versionNumber}`,
    `- Project hash: \`${shortHash}\``,
    "",
    ...(input.warnings.length > 0
      ? ["## Warnings", "", ...input.warnings.map((warning) => `- ${warning}`), ""]
      : []),
    "## Notes",
    "",
    "This project was exported as a standalone Vite + React application. It does not include uploaded screenshot data, AI prompts, or server credentials.",
    "",
  ].join("\n");
}

export function buildGenerationSummary(input: {
  layoutHierarchy?: string;
  planSummary?: string;
  components: string[];
  responsiveStrategy?: string;
  accessibilityStrategy?: string;
  warnings: string[];
  repairCount: number;
  versionNumber: number;
  exportedAt: string;
}): Record<string, unknown> {
  return {
    schemaVersion: "1",
    screenshotAnalysisSummary: input.layoutHierarchy ?? null,
    generationPlanSummary: input.planSummary ?? null,
    components: input.components,
    responsiveStrategy: input.responsiveStrategy ?? null,
    accessibilityConsiderations: input.accessibilityStrategy ?? null,
    warnings: input.warnings,
    repairCount: input.repairCount,
    activeVersionNumber: input.versionNumber,
    exportedAt: input.exportedAt,
  };
}
