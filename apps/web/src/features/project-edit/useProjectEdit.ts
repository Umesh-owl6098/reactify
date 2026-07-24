import { useCallback, useEffect, useRef } from "react";
import type { EditOperationSummary, GenerationStatusResponse } from "@reactify/generation-contracts";
import {
  confirmProjectEdit,
  createProjectEdit,
  fetchEditHistory,
  submitEditClarification,
} from "../../lib/generation-api";
import { useProjectEditStore } from "./projectEditStore";

export function shortenHash(value: string | null | undefined, length = 12): string {
  if (!value) {
    return "—";
  }
  return value.length <= length ? value : `${value.slice(0, length)}…`;
}

export function useProjectEdit(status: GenerationStatusResponse | null, onRefreshStatus: () => void) {
  const submittingRef = useRef(false);
  const store = useProjectEditStore();

  useEffect(() => {
    if (!status?.latestEditSummary) {
      return;
    }
    store.setActiveEdit(status.latestEditSummary);
  }, [status?.latestEditSummary, store]);

  const loadHistory = useCallback(async () => {
    if (!status) {
      return;
    }
    const response = await fetchEditHistory(status.id);
    store.setHistory(response.edits);
  }, [status, store]);

  useEffect(() => {
    if (!status?.editAllowed) {
      return;
    }
    void loadHistory().catch(() => undefined);
  }, [loadHistory, status?.editAllowed, status?.id]);

  const handleEditResponse = useCallback(
    async (edit: EditOperationSummary) => {
      store.setActiveEdit(edit);

      if (edit.status === "clarification_required") {
        store.setPhase("clarifying");
        return;
      }

      if (edit.status === "awaiting_confirmation") {
        store.setPhase("confirming");
        return;
      }

      if (edit.status === "awaiting_sandbox_validation") {
        store.setPhase("awaiting_validation");
        onRefreshStatus();
        await loadHistory();
        return;
      }

      if (edit.status === "completed") {
        store.setPhase("completed");
        onRefreshStatus();
        await loadHistory();
        return;
      }

      if (edit.status === "failed") {
        store.setPhase("failed");
        store.setError(edit.failureReason ?? "Edit failed.");
      }
    },
    [loadHistory, onRefreshStatus, store],
  );

  const submitEdit = useCallback(async () => {
    if (!status?.projectHash || !status.editAllowed || submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    store.setSubmitting(true);
    store.setPhase("submitting");
    store.setError(null);

    try {
      const edit = await createProjectEdit(status.id, {
        instruction: store.instruction.trim(),
        selectedFiles: store.selectedFiles.length > 0 ? store.selectedFiles : undefined,
        selectedComponentIds: store.selectedComponentIds.length > 0 ? store.selectedComponentIds : undefined,
        expectedProjectHash: status.projectHash,
      });
      await handleEditResponse(edit);
    } catch (error) {
      store.setPhase("failed");
      store.setError(error instanceof Error ? error.message : "Edit failed.");
    } finally {
      submittingRef.current = false;
      store.setSubmitting(false);
    }
  }, [handleEditResponse, status, store]);

  const submitClarification = useCallback(
    async (answer: string) => {
      if (!status?.projectHash || !store.activeEdit) {
        return;
      }

      store.setSubmitting(true);
      store.setError(null);
      try {
        const edit = await submitEditClarification(status.id, store.activeEdit.editId, {
          answer,
          expectedProjectHash: status.projectHash,
        });
        await handleEditResponse(edit);
      } catch (error) {
        store.setPhase("failed");
        store.setError(error instanceof Error ? error.message : "Clarification failed.");
      } finally {
        store.setSubmitting(false);
      }
    },
    [handleEditResponse, status, store],
  );

  const confirmEdit = useCallback(async () => {
    if (!status?.projectHash || !store.activeEdit) {
      return;
    }

    store.setSubmitting(true);
    store.setError(null);
    try {
      const edit = await confirmProjectEdit(status.id, store.activeEdit.editId, {
        confirmed: true,
        expectedProjectHash: status.projectHash,
      });
      await handleEditResponse(edit);
    } catch (error) {
      store.setPhase("failed");
      store.setError(error instanceof Error ? error.message : "Edit confirmation failed.");
    } finally {
      store.setSubmitting(false);
    }
  }, [handleEditResponse, status, store]);

  return {
    ...store,
    editAllowed: status?.editAllowed ?? false,
    editBlockedReason: status?.editBlockedReason ?? null,
    projectHash: status?.projectHash ?? null,
    activeVersionNumber: status?.activeVersionNumber ?? null,
    sandboxRevalidationRequired: status?.sandboxRevalidationRequired ?? false,
    clarificationQuestion: status?.clarificationQuestion ?? store.activeEdit?.clarificationQuestion ?? null,
    submitEdit,
    submitClarification,
    confirmEdit,
    loadHistory,
  };
}
