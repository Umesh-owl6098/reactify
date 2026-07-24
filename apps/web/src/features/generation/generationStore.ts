import { create } from "zustand";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";

interface GenerationState {
  generationId: string | null;
  status: GenerationStatusResponse | null;
  error: string | null;
  isLoading: boolean;
  isPolling: boolean;
  setGenerationId: (generationId: string) => void;
  setStatus: (status: GenerationStatusResponse | null) => void;
  setError: (message: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setPolling: (isPolling: boolean) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  generationId: null,
  status: null,
  error: null,
  isLoading: false,
  isPolling: false,
  setGenerationId: (generationId) => set({ generationId, error: null }),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ error: message, isPolling: false }),
  setLoading: (isLoading) => set({ isLoading }),
  setPolling: (isPolling) => set({ isPolling }),
  reset: () =>
    set({
      generationId: null,
      status: null,
      error: null,
      isLoading: false,
      isPolling: false,
    }),
}));
