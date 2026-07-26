import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { isAwaitingSandboxValidation } from "../../lib/generation-api";

const PREVIEW_REVIEW_STATUSES = new Set(["Ready", "Compiling", "RepairRequired", "RepairFailed"]);

export function shouldLoadSandpackPreviewFiles(status: GenerationStatusResponse): boolean {
  if (!status.projectHash || !status.outputs.generatedProject) {
    return false;
  }

  if (isAwaitingSandboxValidation(status)) {
    return true;
  }

  return Boolean(status.sandboxValidation && PREVIEW_REVIEW_STATUSES.has(status.status));
}

export function isSandpackPreviewEnabled(status: GenerationStatusResponse): boolean {
  return shouldLoadSandpackPreviewFiles(status);
}

export function isComparisonCaptureReady(status: GenerationStatusResponse): boolean {
  return (
    shouldLoadSandpackPreviewFiles(status) &&
    status.sandboxValidation?.compilation.success === true &&
    status.sandboxValidation?.runtime.success === true
  );
}
