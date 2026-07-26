import { create } from "zustand";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";

interface GenerationState {
  generationId: string | null;
  status: GenerationStatusResponse | null;
  error: string | null;
  isLoading: boolean;
  isPolling: boolean;
  loadRequestId: number;
  setGenerationId: (generationId: string) => void;
  setStatus: (status: GenerationStatusResponse | null) => void;
  setError: (message: string | null) => void;
  setLoading: (isLoading: boolean) => void;
  setPolling: (isPolling: boolean) => void;
  beginGenerationLoad: (generationId: string) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  generationId: null,
  status: null,
  error: null,
  isLoading: false,
  isPolling: false,
  loadRequestId: 0,
  setGenerationId: (generationId) => set({ generationId, error: null }),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ error: message }),
  setLoading: (isLoading) => set({ isLoading }),
  setPolling: (isPolling) => set({ isPolling }),
  beginGenerationLoad: (generationId) =>
    set((state) => ({
      generationId,
      status: null,
      error: null,
      isLoading: true,
      isPolling: false,
      loadRequestId: state.loadRequestId + 1,
    })),
  reset: () =>
    set({
      generationId: null,
      status: null,
      error: null,
      isLoading: false,
      isPolling: false,
      loadRequestId: 0,
    }),
}));
