import { useCallback, useEffect, useRef } from "react";
import type { EditOperationSummary, GenerationStatusResponse } from "@reactify/generation-contracts";
import {
  confirmProjectEdit,
  createProjectEdit,
  fetchEditHistory,
  submitEditClarification,
} from "../../lib/generation-api";
import { useGenerationScopedFetch } from "../generation/useGenerationScopedFetch";
import { keepGenerationRecord, keepGenerationRecords } from "../generation/generationScopedRecords";
import { useProjectEditStore } from "./projectEditStore";

export function shortenHash(value: string | null | undefined, length = 12): string {
  if (!value) {
    return "—";
  }
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function useProjectEdit(status: GenerationStatusResponse | null, onRefreshStatus: () => void) {
  const submittingRef = useRef(false);
  const generationId = status?.id ?? null;
  const editAllowed = status?.editAllowed ?? false;
  const projectHash = status?.projectHash ?? null;
  const latestEditId = status?.latestEditSummary?.editId ?? null;

  const instruction = useProjectEditStore((state) => state.instruction);
  const selectedFiles = useProjectEditStore((state) => state.selectedFiles);
  const selectedComponentIds = useProjectEditStore((state) => state.selectedComponentIds);
  const phase = useProjectEditStore((state) => state.phase);
  const error = useProjectEditStore((state) => state.error);
  const activeEdit = useProjectEditStore((state) => state.activeEdit);
  const history = useProjectEditStore((state) => state.history);
  const isSubmitting = useProjectEditStore((state) => state.isSubmitting);
  const setInstruction = useProjectEditStore((state) => state.setInstruction);
  const toggleFile = useProjectEditStore((state) => state.toggleFile);
  const toggleComponent = useProjectEditStore((state) => state.toggleComponent);
  const setPhase = useProjectEditStore((state) => state.setPhase);
  const setError = useProjectEditStore((state) => state.setError);
  const setActiveEdit = useProjectEditStore((state) => state.setActiveEdit);
  const setHistory = useProjectEditStore((state) => state.setHistory);
  const setSubmitting = useProjectEditStore((state) => state.setSubmitting);

  const resetStore = useCallback(() => {
    useProjectEditStore.getState().reset();
  }, []);

  // History stays readable even when new edits are blocked. Gating the fetch on
  // `editAllowed` used to leave whatever the store already held on screen.
  const { runFetch } = useGenerationScopedFetch({
    generationId,
    onGenerationChange: resetStore,
  });

  const loadHistory = useCallback(
    async (force = false) => {
      await runFetch(async (scope) => {
        const response = await fetchEditHistory(scope.generationId);
        if (scope.isStale()) {
          return;
        }
        setHistory(keepGenerationRecords(response.edits, scope.generationId));
      }, { force });
    },
    [runFetch, setHistory],
  );

  useEffect(() => {
    // History is supplementary; a failure here must not reject into the void or
    // block the edit form, which reports its own errors on submit.
    void loadHistory().catch(() => undefined);
  }, [generationId, loadHistory]);

  useEffect(() => {
    const summary = keepGenerationRecord(status?.latestEditSummary ?? null, generationId);

    if (!summary || summary.editId !== latestEditId) {
      // No edit belongs to this generation any more; drop whatever the shared
      // store still holds rather than leaving a previous edit on screen.
      if (useProjectEditStore.getState().activeEdit) {
        setActiveEdit(null);
      }
      return;
    }

    const currentEditId = useProjectEditStore.getState().activeEdit?.editId ?? null;
    if (currentEditId === latestEditId) {
      return;
    }

    setActiveEdit(summary);
  }, [generationId, latestEditId, status?.latestEditSummary, setActiveEdit]);

  const handleEditResponse = useCallback(
    async (edit: EditOperationSummary) => {
      setActiveEdit(edit);

      if (edit.status === "clarification_required") {
        setPhase("clarifying");
        return;
      }

      if (edit.status === "awaiting_confirmation") {
        setPhase("confirming");
        return;
      }

      if (edit.status === "awaiting_sandbox_validation") {
        setPhase("awaiting_validation");
        onRefreshStatus();
        await loadHistory(true);
        return;
      }

      if (edit.status === "completed") {
        setPhase("completed");
        onRefreshStatus();
        await loadHistory(true);
        return;
      }

      if (edit.status === "failed") {
        setPhase("failed");
        setError(edit.failureReason ?? "Edit failed.");
      }
    },
    [loadHistory, onRefreshStatus, setActiveEdit, setError, setPhase],
  );

  const submitEdit = useCallback(async () => {
    if (!status?.projectHash || submittingRef.current) {
      return;
    }

    if (!status.editAllowed) {
      setPhase("failed");
      setError(
        status.editBlockedReason
          ? `Edit unavailable: ${status.editBlockedReason.replaceAll("_", " ")}.`
          : "Edit is not allowed in the current generation state.",
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setPhase("submitting");
    setError(null);

    try {
      const edit = await createProjectEdit(status.id, {
        instruction: instruction.trim(),
        selectedFiles: selectedFiles.length > 0 ? selectedFiles : undefined,
        selectedComponentIds: selectedComponentIds.length > 0 ? selectedComponentIds : undefined,
        expectedProjectHash: status.projectHash,
      });
      await handleEditResponse(edit);
    } catch (loadError) {
      setPhase("failed");
      setError(loadError instanceof Error ? loadError.message : "Edit failed.");
      onRefreshStatus();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [
    handleEditResponse,
    instruction,
    selectedComponentIds,
    selectedFiles,
    setError,
    setPhase,
    setSubmitting,
    status,
  ]);

  const submitClarification = useCallback(
    async (answer: string) => {
      if (!status?.projectHash || !activeEdit) {
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const edit = await submitEditClarification(status.id, activeEdit.editId, {
          answer,
          expectedProjectHash: status.projectHash,
        });
        await handleEditResponse(edit);
      } catch (loadError) {
        setPhase("failed");
        setError(loadError instanceof Error ? loadError.message : "Clarification failed.");
      } finally {
        setSubmitting(false);
      }
    },
    [activeEdit, handleEditResponse, setError, setPhase, setSubmitting, status],
  );

  const confirmEdit = useCallback(async () => {
    if (!status?.projectHash || !activeEdit) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const edit = await confirmProjectEdit(status.id, activeEdit.editId, {
        confirmed: true,
        expectedProjectHash: status.projectHash,
      });
      await handleEditResponse(edit);
    } catch (loadError) {
      setPhase("failed");
      setError(loadError instanceof Error ? loadError.message : "Edit confirmation failed.");
    } finally {
      setSubmitting(false);
    }
  }, [activeEdit, handleEditResponse, setError, setPhase, setSubmitting, status]);

  return {
    instruction,
    selectedFiles,
    selectedComponentIds,
    phase,
    error,
    activeEdit,
    history,
    isSubmitting,
    setInstruction,
    toggleFile,
    toggleComponent,
    setPhase,
    setError,
    setActiveEdit,
    setHistory,
    setSubmitting,
    editAllowed,
    editBlockedReason: status?.editBlockedReason ?? null,
    projectHash,
    activeVersionNumber: status?.activeVersionNumber ?? null,
    sandboxRevalidationRequired: status?.sandboxRevalidationRequired ?? false,
    clarificationQuestion: status?.clarificationQuestion ?? activeEdit?.clarificationQuestion ?? null,
    submitEdit,
    submitClarification,
    confirmEdit,
    loadHistory,
  };
}
