import { create } from "zustand";
import type { VisualComparisonResult } from "@reactify/generation-contracts";

export type VisualComparisonPhase =
  | "idle"
  | "creating"
  | "capturing"
  | "processing"
  | "completed"
  | "confirming_correction"
  | "correcting"
  | "awaiting_revalidation"
  | "failed";

export type VisualDiffMode = "side-by-side" | "overlay" | "diff";

interface VisualComparisonStoreState {
  phase: VisualComparisonPhase;
  activeComparison: VisualComparisonResult | null;
  history: VisualComparisonResult[];
  selectedRegionId: string | null;
  diffMode: VisualDiffMode;
  viewportPreset: "desktop" | "tablet" | "mobile";
  error: string | null;
  submitting: boolean;
  setPhase: (phase: VisualComparisonPhase) => void;
  setActiveComparison: (comparison: VisualComparisonResult | null) => void;
  setHistory: (history: VisualComparisonResult[]) => void;
  setSelectedRegionId: (regionId: string | null) => void;
  setDiffMode: (mode: VisualDiffMode) => void;
  setViewportPreset: (preset: "desktop" | "tablet" | "mobile") => void;
  setError: (error: string | null) => void;
  setSubmitting: (submitting: boolean) => void;
  reset: () => void;
}

const initialState = {
  phase: "idle" as VisualComparisonPhase,
  activeComparison: null,
  history: [],
  selectedRegionId: null,
  diffMode: "side-by-side" as VisualDiffMode,
  viewportPreset: "desktop" as const,
  error: null,
  submitting: false,
};

export const useVisualComparisonStore = create<VisualComparisonStoreState>((set) => ({
  ...initialState,
  setPhase: (phase) => set({ phase }),
  setActiveComparison: (activeComparison) => set({ activeComparison }),
  setHistory: (history) => set({ history }),
  setSelectedRegionId: (selectedRegionId) => set({ selectedRegionId }),
  setDiffMode: (diffMode) => set({ diffMode }),
  setViewportPreset: (viewportPreset) => set({ viewportPreset }),
  setError: (error) => set({ error }),
  setSubmitting: (submitting) => set({ submitting }),
  reset: () => set(initialState),
}));

export const VIEWPORT_DIMENSIONS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 1 },
} as const;
