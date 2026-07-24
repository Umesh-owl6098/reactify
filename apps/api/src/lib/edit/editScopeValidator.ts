import type { EditIntentV1, ProjectEditV1 } from "@reactify/generation-contracts";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";
import { normalizeProjectPath } from "../validation/filePathValidator.js";

export interface EditScopeLimits {
  highRiskFileThreshold: number;
  maxScopeRatio: number;
}

export function validateSelectedScope(input: {
  project: GeneratedProjectV1;
  selectedFiles?: string[];
  selectedComponentIds?: string[];
}): { ok: true } | { ok: false; message: string } {
  const knownPaths = new Set(input.project.files.map((file) => normalizeProjectPath(file.path)));
  const knownComponents = new Set(input.project.components.map((component) => component.name));

  for (const file of input.selectedFiles ?? []) {
    const normalized = normalizeProjectPath(file);
    if (!knownPaths.has(normalized)) {
      return { ok: false, message: `Selected file "${normalized}" was not found in the active project.` };
    }
  }

  for (const componentId of input.selectedComponentIds ?? []) {
    if (!knownComponents.has(componentId)) {
      return { ok: false, message: `Selected component "${componentId}" was not found in the active project.` };
    }
  }

  return { ok: true };
}

export function requiresConfirmation(intent: EditIntentV1, edit: ProjectEditV1, limits: EditScopeLimits): boolean {
  if (intent.riskLevel === "high") {
    return true;
  }

  if (edit.deletedFiles.length >= 2) {
    return true;
  }

  if (edit.dependencyChanges.length > 0 || intent.requiresDependencyChange) {
    return true;
  }

  if (edit.changedFiles.length > limits.highRiskFileThreshold) {
    return true;
  }

  const routingChanged = edit.changedFiles.some((file) => /route|router|App\.tsx/i.test(file.path));
  if (routingChanged && edit.changedFiles.length > 1) {
    return true;
  }

  return false;
}

export function validateEditEffectiveness(input: {
  project: GeneratedProjectV1;
  edit: ProjectEditV1;
  projectHashBefore: string;
  projectHashAfter: string;
  selectedFiles?: string[];
  intent: EditIntentV1;
  limits: EditScopeLimits;
}):
  | { ok: true }
  | { ok: false; errorCode: typeof ErrorCode.EDIT_NO_EFFECT | typeof ErrorCode.EDIT_SCOPE_EXCEEDED; message: string } {
  const changedPaths = new Set<string>();
  for (const file of input.edit.changedFiles) {
    changedPaths.add(normalizeProjectPath(file.path));
  }
  for (const deleted of input.edit.deletedFiles) {
    changedPaths.add(normalizeProjectPath(deleted));
  }

  if (changedPaths.size === 0 && input.edit.dependencyChanges.length === 0) {
    return { ok: false, errorCode: ErrorCode.EDIT_NO_EFFECT, message: "Edit made no changes to the project." };
  }

  if (input.projectHashBefore === input.projectHashAfter) {
    return { ok: false, errorCode: ErrorCode.EDIT_NO_EFFECT, message: "Edit did not change the project hash." };
  }

  let identicalCount = 0;
  for (const changed of input.edit.changedFiles) {
    const existing = input.project.files.find((file) => normalizeProjectPath(file.path) === normalizeProjectPath(changed.path));
    if (existing && existing.content === changed.fullContent) {
      identicalCount += 1;
    }
  }

  if (identicalCount === input.edit.changedFiles.length && input.edit.deletedFiles.length === 0 && input.edit.dependencyChanges.length === 0) {
    return { ok: false, errorCode: ErrorCode.EDIT_NO_EFFECT, message: "Edit changed files contain identical content." };
  }

  if ((input.selectedFiles?.length ?? 0) > 0) {
    const selected = new Set((input.selectedFiles ?? []).map((path) => normalizeProjectPath(path)));
    const touchesSelection = [...changedPaths].some((path) => selected.has(path));
    if (!touchesSelection) {
      return { ok: false, errorCode: ErrorCode.EDIT_SCOPE_EXCEEDED, message: "Edit did not affect the selected files." };
    }
  }

  const totalFiles = input.project.files.length;
  const changedRatio = changedPaths.size / Math.max(totalFiles, 1);
  const isSimpleIntent = ["style_change", "content_change"].includes(input.intent.intentType);
  if (isSimpleIntent && changedRatio > input.limits.maxScopeRatio) {
    return {
      ok: false,
      errorCode: ErrorCode.EDIT_SCOPE_EXCEEDED,
      message: "Edit modified too many files for the requested change.",
    };
  }

  return { ok: true };
}
