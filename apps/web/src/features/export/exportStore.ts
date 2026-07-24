import { create } from "zustand";
import type { ExportSummary } from "@reactify/generation-contracts";

export type ExportPhase = "idle" | "preparing" | "ready" | "failed";

interface ExportStoreState {
  isDialogOpen: boolean;
  phase: ExportPhase;
  error: string | null;
  latestSummary: ExportSummary | null;
  history: ExportSummary[];
  isSubmitting: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  setPhase: (phase: ExportPhase) => void;
  setError: (message: string | null) => void;
  setLatestSummary: (summary: ExportSummary | null) => void;
  setHistory: (history: ExportSummary[]) => void;
  setSubmitting: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  isDialogOpen: false,
  phase: "idle" as ExportPhase,
  error: null,
  latestSummary: null,
  history: [] as ExportSummary[],
  isSubmitting: false,
};

export const useExportStore = create<ExportStoreState>((set) => ({
  ...initialState,
  openDialog: () => set({ isDialogOpen: true, error: null }),
  closeDialog: () => set({ isDialogOpen: false }),
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  setLatestSummary: (latestSummary) => set({ latestSummary }),
  setHistory: (history) => set({ history }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  reset: () => set(initialState),
}));
