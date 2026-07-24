import { createHash } from "node:crypto";

const RESERVED_NAMES = new Set([
  "node_modules",
  "favicon.ico",
  "node",
  "npm",
  "reactify-export",
  "con",
  "prn",
  "aux",
  "nul",
]);

const MAX_LENGTH = 64;

function isReservedName(name: string): boolean {
  const normalized = name
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[./\\]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return RESERVED_NAMES.has(name.toLowerCase()) || RESERVED_NAMES.has(normalized);
}

export function sanitizeProjectName(input: string | undefined, fallbackName: string | undefined): string {
  const trimmedInput = input?.trim();
  if (trimmedInput && isReservedName(trimmedInput)) {
    return "reactify-export";
  }

  const base = trimmedInput || fallbackName?.trim() || "reactify-export";
  if (!base.trim()) {
    return "reactify-export";
  }

  let sanitized = base
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+/, "");

  if (!sanitized || RESERVED_NAMES.has(sanitized)) {
    sanitized = "reactify-export";
  }

  if (sanitized.length > MAX_LENGTH) {
    sanitized = sanitized.slice(0, MAX_LENGTH).replace(/-+$/g, "");
  }

  if (!sanitized || RESERVED_NAMES.has(sanitized)) {
    return "reactify-export";
  }

  return sanitized;
}

export function buildExportFilename(projectName: string, versionNumber: number): string {
  return `${projectName}-v${versionNumber}.zip`;
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function computeIdempotencyFingerprint(input: {
  generationId: string;
  versionId: string;
  projectName: string;
  includeMetadata: boolean;
  includeGenerationSummary: boolean;
  idempotencyKey?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generationId: input.generationId,
        versionId: input.versionId,
        projectName: input.projectName,
        includeMetadata: input.includeMetadata,
        includeGenerationSummary: input.includeGenerationSummary,
        idempotencyKey: input.idempotencyKey ?? "",
      }),
    )
    .digest("hex");
}

export function shortenId(value: string, length = 8): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}
