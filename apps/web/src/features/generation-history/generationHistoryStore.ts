import { create } from "zustand";
import type { GenerationSummary } from "@reactify/generation-contracts";

interface GenerationHistoryState {
  items: GenerationSummary[];
  total: number;
  limit: number;
  offset: number;
  statusFilter: string;
  isLoading: boolean;
  error: string | null;
  setItems: (items: GenerationSummary[], total: number) => void;
  setPagination: (limit: number, offset: number) => void;
  setStatusFilter: (statusFilter: string) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGenerationHistoryStore = create<GenerationHistoryState>((set) => ({
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
  statusFilter: "",
  isLoading: false,
  error: null,
  setItems: (items, total) => set({ items, total, error: null }),
  setPagination: (limit, offset) => set({ limit, offset }),
  setStatusFilter: (statusFilter) => set({ statusFilter, offset: 0 }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
}));
