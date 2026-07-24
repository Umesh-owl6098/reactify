import type { Diagnostic, GeneratedProjectV1 } from "@reactify/generation-contracts";

const BLOCKED_FILE_PATTERNS = [
  /^\.env/i,
  /^\.env\./i,
  /\/\.env/i,
  /^\.git/i,
];

export interface SandpackFileEntry {
  code: string;
  active?: boolean;
  hidden?: boolean;
}

export type SandpackFiles = Record<string, string | SandpackFileEntry>;

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function isBlockedFile(path: string): boolean {
  const normalized = normalizePath(path);
  return BLOCKED_FILE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function toSandpackFiles(
  project: GeneratedProjectV1,
  options: { activePath?: string | null } = {},
): SandpackFiles {
  const files: SandpackFiles = {};
  const activePath = options.activePath ? normalizePath(options.activePath) : null;

  for (const file of project.files) {
    const path = normalizePath(file.path);
    if (isBlockedFile(path)) {
      continue;
    }

    files[`/${path}`] = {
      code: file.content,
      active: activePath ? path === activePath : path === normalizePath(project.entryFile),
    };
  }

  return files;
}

export function getSandpackDependencies(project: GeneratedProjectV1): Record<string, string> {
  return {
    ...project.dependencies,
    ...project.devDependencies,
  };
}

export function filterSandpackDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.filter((diagnostic) => !isBlockedFile(diagnostic.filePath ?? ""));
}
