import { create } from "zustand";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";

interface GenerationState {
  generationId: string | null;
  status: GenerationStatusResponse | null;
  error: string | null;
  isPolling: boolean;
  setGenerationId: (generationId: string) => void;
  setStatus: (status: GenerationStatusResponse) => void;
  setError: (message: string) => void;
  setPolling: (isPolling: boolean) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  generationId: null,
  status: null,
  error: null,
  isPolling: false,
  setGenerationId: (generationId) => set({ generationId, error: null }),
  setStatus: (status) => set({ status }),
  setError: (message) => set({ error: message, isPolling: false }),
  setPolling: (isPolling) => set({ isPolling }),
  reset: () =>
    set({
      generationId: null,
      status: null,
      error: null,
      isPolling: false,
    }),
}));
