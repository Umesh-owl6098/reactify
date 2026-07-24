import { useCallback, useEffect } from "react";
import type { GenerationSummary } from "@reactify/generation-contracts";
import { fetchGenerationList } from "../../lib/generation-api";
import { useGenerationHistoryStore } from "./generationHistoryStore";

export function useGenerationHistory() {
  const items = useGenerationHistoryStore((state) => state.items);
  const total = useGenerationHistoryStore((state) => state.total);
  const limit = useGenerationHistoryStore((state) => state.limit);
  const offset = useGenerationHistoryStore((state) => state.offset);
  const statusFilter = useGenerationHistoryStore((state) => state.statusFilter);
  const isLoading = useGenerationHistoryStore((state) => state.isLoading);
  const error = useGenerationHistoryStore((state) => state.error);
  const setItems = useGenerationHistoryStore((state) => state.setItems);
  const setPagination = useGenerationHistoryStore((state) => state.setPagination);
  const setStatusFilter = useGenerationHistoryStore((state) => state.setStatusFilter);
  const setLoading = useGenerationHistoryStore((state) => state.setLoading);
  const setError = useGenerationHistoryStore((state) => state.setError);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchGenerationList({
        status: statusFilter || undefined,
        limit,
        offset,
      });
      setItems(response.items, response.total);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "Unable to load generation history.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, setError, setItems, setLoading, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    items,
    total,
    limit,
    offset,
    statusFilter,
    isLoading,
    error,
    setPagination,
    setStatusFilter,
    reload: load,
  };
}

export type { GenerationSummary };
