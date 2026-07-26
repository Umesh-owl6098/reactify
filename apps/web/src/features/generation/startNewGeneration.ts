import type { NavigateFunction } from "react-router-dom";
import { useGenerationStore } from "./generationStore";
import { useJobStore } from "../jobs/jobStore";
import { useUploadStore } from "../upload/uploadStore";
import { useExportStore } from "../export/exportStore";
import { useProjectEditStore } from "../project-edit/projectEditStore";
import { useVisualComparisonStore } from "../visual-comparison/visualComparisonStore";
import { usePreviewStore } from "../preview/previewStore";

/**
 * Every store that holds records belonging to one specific generation. Leaving any
 * of these populated leaks another generation's edits, exports, or comparisons into
 * the next workspace the user opens.
 */
export function resetGenerationScopedStores(): void {
  useExportStore.getState().reset();
  useProjectEditStore.getState().reset();
  useVisualComparisonStore.getState().reset();
  usePreviewStore.getState().reset();
}

/** Clears in-memory workflow state and opens the upload workspace. */
export function startNewGeneration(navigate: NavigateFunction): void {
  useUploadStore.getState().clear();
  useGenerationStore.getState().reset();
  useJobStore.getState().reset();
  resetGenerationScopedStores();
  navigate("/", { replace: true });
}

/** Clears stale workflow state when landing on the history home page. */
export function resetActiveGenerationSession(): void {
  useUploadStore.getState().clear();
  useGenerationStore.getState().reset();
  useJobStore.getState().reset();
  resetGenerationScopedStores();
}
