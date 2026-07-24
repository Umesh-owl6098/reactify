import { ErrorCode } from "@reactify/shared";

const FORBIDDEN_PREFIXES = [
  ".git/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".turbo/",
  ".pnpm-store/",
];

const FORBIDDEN_EXACT = new Set([
  ".env",
  ".npmrc",
  ".pnpm-debug.log",
]);

export interface FilePathValidationSuccess {
  ok: true;
  normalizedPath: string;
}

export interface FilePathValidationFailure {
  ok: false;
  path: string;
  code: typeof ErrorCode.UNSAFE_FILE_PATH;
  message: string;
}

export type FilePathValidationResult = FilePathValidationSuccess | FilePathValidationFailure;

export function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

export function validateProjectFilePath(path: string): FilePathValidationResult {
  const normalizedPath = normalizeProjectPath(path);

  if (!normalizedPath) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "File path must not be empty.",
    };
  }

  if (normalizedPath.includes("\0")) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "File path contains null bytes.",
    };
  }

  if (normalizedPath.startsWith("/") || normalizedPath.startsWith("~")) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "Absolute or home-relative paths are not allowed.",
    };
  }

  if (/^[a-zA-Z]:[\\/]/.test(normalizedPath)) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "Windows drive-letter paths are not allowed.",
    };
  }

  if (normalizedPath.split("/").some((segment) => segment === "..")) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "Directory traversal is not allowed.",
    };
  }

  const lowerPath = normalizedPath.toLowerCase();
  if (FORBIDDEN_EXACT.has(lowerPath) || lowerPath.startsWith(".env.")) {
    return {
      ok: false,
      path,
      code: ErrorCode.UNSAFE_FILE_PATH,
      message: "Environment or secret paths are not allowed.",
    };
  }

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (lowerPath === prefix.slice(0, -1) || lowerPath.startsWith(prefix)) {
      return {
        ok: false,
        path,
        code: ErrorCode.UNSAFE_FILE_PATH,
        message: `Path is not allowed inside ${prefix}.`,
      };
    }
  }

  return { ok: true, normalizedPath };
}

export function findDuplicateNormalizedPaths(paths: string[]): string | null {
  const seen = new Set<string>();

  for (const path of paths) {
    const normalized = normalizeProjectPath(path);
    if (seen.has(normalized)) {
      return normalized;
    }
    seen.add(normalized);
  }

  return null;
}
