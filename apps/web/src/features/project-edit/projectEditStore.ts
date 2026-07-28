import { create } from "zustand";
import type { EditOperationSummary } from "@reactify/generation-contracts";

export type EditPhase =
  | "idle"
  | "submitting"
  | "processing"
  | "clarifying"
  | "confirming"
  | "awaiting_validation"
  | "completed"
  | "failed";

interface ProjectEditStoreState {
  instruction: string;
  selectedFiles: string[];
  selectedComponentIds: string[];
  phase: EditPhase;
  error: string | null;
  activeEdit: EditOperationSummary | null;
  history: EditOperationSummary[];
  isSubmitting: boolean;
  setInstruction: (value: string) => void;
  toggleFile: (path: string) => void;
  toggleComponent: (componentId: string) => void;
  clearScope: () => void;
  setPhase: (phase: EditPhase) => void;
  setError: (message: string | null) => void;
  setActiveEdit: (edit: EditOperationSummary | null) => void;
  setHistory: (history: EditOperationSummary[]) => void;
  setSubmitting: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  instruction: "",
  selectedFiles: [] as string[],
  selectedComponentIds: [] as string[],
  phase: "idle" as EditPhase,
  error: null,
  activeEdit: null,
  history: [] as EditOperationSummary[],
  isSubmitting: false,
};

export const useProjectEditStore = create<ProjectEditStoreState>((set) => ({
  ...initialState,
  setInstruction: (instruction) => set({ instruction }),
  toggleFile: (path) =>
    set((state) => ({
      selectedFiles: state.selectedFiles.includes(path)
        ? state.selectedFiles.filter((entry) => entry !== path)
        : [...state.selectedFiles, path],
    })),
  toggleComponent: (componentId) =>
    set((state) => ({
      selectedComponentIds: state.selectedComponentIds.includes(componentId)
        ? state.selectedComponentIds.filter((entry) => entry !== componentId)
        : [...state.selectedComponentIds, componentId],
    })),
  clearScope: () => set({ selectedFiles: [], selectedComponentIds: [] }),
  setPhase: (phase) => set({ phase }),
  setError: (error) => set({ error }),
  setActiveEdit: (activeEdit) => set({ activeEdit }),
  setHistory: (history) => set({ history }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
  reset: () => set(initialState),
}));
