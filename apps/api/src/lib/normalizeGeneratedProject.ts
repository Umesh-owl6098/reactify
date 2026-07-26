import { normalizeProjectPath } from "./validation/filePathValidator.js";

const LANGUAGE_ALIASES: Record<string, string> = {
  typescript: "ts",
  javascript: "js",
  jsx: "tsx",
  stylesheet: "css",
  markdown: "html",
};

export interface NormalizationResult {
  value: unknown;
  applied: string[];
}

function coerceBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function coerceRecordValuesToString(record: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) {
      continue;
    }
    normalized[key] = typeof value === "string" ? value : String(value);
  }
  return normalized;
}

function normalizeLanguage(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const lower = value.toLowerCase();
  return LANGUAGE_ALIASES[lower] ?? lower;
}

function objectMapToFilesArray(
  filesMap: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return Object.entries(filesMap).map(([path, value]) => {
    if (typeof value === "string") {
      return {
        path,
        language: path.endsWith(".tsx") ? "tsx" : path.endsWith(".ts") ? "ts" : "json",
        content: value,
        purpose: "Generated file",
      };
    }

    if (value && typeof value === "object") {
      return { path, ...(value as Record<string, unknown>) };
    }

    return {
      path,
      language: "json",
      content: String(value),
      purpose: "Generated file",
    };
  });
}

function normalizePropDefinition(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const prop = { ...(raw as Record<string, unknown>) };
  const required = coerceBoolean(prop.required);
  if (required !== undefined) {
    prop.required = required;
  }
  return prop;
}

function normalizeComponentMetadata(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const metadata = { ...(raw as Record<string, unknown>) };
  const children = coerceBoolean(metadata.children);
  if (children !== undefined) {
    metadata.children = children;
  }
  if (Array.isArray(metadata.props)) {
    metadata.props = metadata.props
      .map((entry) => normalizePropDefinition(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
  if (!Array.isArray(metadata.dependencies)) {
    metadata.dependencies = [];
  }
  return metadata;
}

function normalizeComponentRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const component = { ...(raw as Record<string, unknown>) };
  const exported = coerceBoolean(component.exported);
  if (exported !== undefined) {
    component.exported = exported;
  }
  if (Array.isArray(component.props)) {
    component.props = component.props
      .map((entry) => normalizePropDefinition(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }
  if (!Array.isArray(component.dependencies)) {
    component.dependencies = [];
  }
  if (typeof component.filePath === "string") {
    component.filePath = normalizeProjectPath(component.filePath.replace(/^\/+/, ""));
  }
  return component;
}

function normalizeFileEntry(raw: unknown, applied: string[]): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const file = { ...(raw as Record<string, unknown>) };

  if (typeof file.path === "string") {
    const normalizedPath = normalizeProjectPath(file.path.replace(/^\/+/, ""));
    if (normalizedPath !== file.path) {
      applied.push("file_path_made_relative");
    }
    file.path = normalizedPath;
  }

  const language = normalizeLanguage(file.language);
  if (language && language !== file.language) {
    applied.push("file_language_normalized");
    file.language = language;
  }

  if (file.componentMetadata !== undefined && file.componentMetadata !== null) {
    file.componentMetadata = normalizeComponentMetadata(file.componentMetadata);
  }

  if (typeof file.content === "number") {
    file.content = String(file.content);
    applied.push("file_content_stringified");
  }

  return file;
}

function dedupeFilesByPath(files: Array<Record<string, unknown>>, applied: string[]): Array<Record<string, unknown>> {
  const byPath = new Map<string, Record<string, unknown>>();
  for (const file of files) {
    if (typeof file.path !== "string") {
      continue;
    }
    byPath.set(normalizeProjectPath(file.path), file);
  }
  if (byPath.size !== files.length) {
    applied.push("duplicate_file_paths_removed");
  }
  return [...byPath.values()];
}

export function normalizeGeneratedProjectPayload(raw: unknown): NormalizationResult {
  const applied: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { value: raw, applied };
  }

  const obj = { ...(raw as Record<string, unknown>) };

  if (typeof obj.schemaVersion === "number") {
    obj.schemaVersion = String(obj.schemaVersion);
    applied.push("schemaVersion_coerced_to_string");
  }

  if (obj.dependencies && typeof obj.dependencies === "object" && !Array.isArray(obj.dependencies)) {
    obj.dependencies = coerceRecordValuesToString(obj.dependencies as Record<string, unknown>);
    applied.push("dependency_values_stringified");
  }

  if (obj.devDependencies && typeof obj.devDependencies === "object" && !Array.isArray(obj.devDependencies)) {
    obj.devDependencies = coerceRecordValuesToString(obj.devDependencies as Record<string, unknown>);
    applied.push("dev_dependency_values_stringified");
  }

  if (obj.devDependencies === undefined) {
    obj.devDependencies = null;
    applied.push("devDependencies_nullified");
  }

  if (obj.generationPlanRef === undefined) {
    obj.generationPlanRef = null;
  }
  if (obj.designAnalysisRef === undefined) {
    obj.designAnalysisRef = null;
  }

  if (obj.files && typeof obj.files === "object" && !Array.isArray(obj.files)) {
    obj.files = objectMapToFilesArray(obj.files as Record<string, unknown>);
    applied.push("files_map_to_array");
  }

  if (Array.isArray(obj.files)) {
    const normalizedFiles = obj.files
      .map((entry) => normalizeFileEntry(entry, applied))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
    obj.files = dedupeFilesByPath(normalizedFiles, applied);
  }

  if (obj.warnings === undefined || obj.warnings === null) {
    obj.warnings = [];
    applied.push("warnings_defaulted");
  }

  if (Array.isArray(obj.components)) {
    obj.components = obj.components
      .map((entry) => normalizeComponentRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null);
  }

  if (typeof obj.entryFile === "string") {
    const normalizedEntry = normalizeProjectPath(obj.entryFile.replace(/^\/+/, ""));
    if (normalizedEntry !== obj.entryFile) {
      obj.entryFile = normalizedEntry;
      applied.push("entryFile_made_relative");
    }
  }

  for (const file of Array.isArray(obj.files) ? obj.files : []) {
    if (file && typeof file === "object" && (file as Record<string, unknown>).componentMetadata === undefined) {
      (file as Record<string, unknown>).componentMetadata = null;
    }
  }

  return { value: obj, applied: [...new Set(applied)] };
}

export function stripNullStructuredFields(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const obj = { ...(raw as Record<string, unknown>) };
  if (obj.generationPlanRef === null) {
    delete obj.generationPlanRef;
  }
  if (obj.designAnalysisRef === null) {
    delete obj.designAnalysisRef;
  }
  if (obj.devDependencies === null) {
    delete obj.devDependencies;
  }

  if (Array.isArray(obj.files)) {
    obj.files = obj.files.map((file) => {
      if (!file || typeof file !== "object") {
        return file;
      }
      const copy = { ...(file as Record<string, unknown>) };
      if (copy.componentMetadata === null) {
        delete copy.componentMetadata;
      }
      return copy;
    });
  }

  return obj;
}
