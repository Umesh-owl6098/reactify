import { create } from "zustand";

export type PreviewViewportPreset = "mobile" | "tablet" | "desktop" | "custom";

export interface PreviewViewport {
  preset: PreviewViewportPreset;
  width: number;
  height: number;
}

export type PreviewPhase =
  | "idle"
  | "preparing"
  | "installing"
  | "compiling"
  | "compilation_failed"
  | "running"
  | "runtime_validation"
  | "reporting"
  | "ready"
  | "repair_required"
  | "report_failed";

interface PreviewStoreState {
  viewport: PreviewViewport;
  fitToContainer: boolean;
  actualSize: boolean;
  phase: PreviewPhase;
  compilationErrors: import("@reactify/generation-contracts").Diagnostic[];
  compilationWarnings: import("@reactify/generation-contracts").Diagnostic[];
  runtimeErrors: import("@reactify/generation-contracts").Diagnostic[];
  runtimeWarnings: import("@reactify/generation-contracts").Diagnostic[];
  selectedDiagnosticPath: string | null;
  reportSubmitted: boolean;
  reportError: string | null;
  reloadToken: number;
  setViewportPreset: (preset: Exclude<PreviewViewportPreset, "custom">) => void;
  setCustomViewport: (width: number, height: number) => void;
  toggleFitToContainer: () => void;
  toggleActualSize: () => void;
  setPhase: (phase: PreviewPhase) => void;
  setDiagnostics: (input: {
    compilationErrors?: PreviewStoreState["compilationErrors"];
    compilationWarnings?: PreviewStoreState["compilationWarnings"];
    runtimeErrors?: PreviewStoreState["runtimeErrors"];
    runtimeWarnings?: PreviewStoreState["runtimeWarnings"];
  }) => void;
  selectDiagnosticPath: (path: string | null) => void;
  markReportSubmitted: () => void;
  setReportError: (message: string | null) => void;
  reloadPreview: () => void;
  reset: () => void;
}

const VIEWPORT_PRESETS: Record<Exclude<PreviewViewportPreset, "custom">, Pick<PreviewViewport, "width" | "height">> = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 },
};

const initialState = {
  viewport: { preset: "desktop" as const, ...VIEWPORT_PRESETS.desktop },
  fitToContainer: true,
  actualSize: false,
  phase: "idle" as PreviewPhase,
  compilationErrors: [],
  compilationWarnings: [],
  runtimeErrors: [],
  runtimeWarnings: [],
  selectedDiagnosticPath: null,
  reportSubmitted: false,
  reportError: null,
  reloadToken: 0,
};

export const usePreviewStore = create<PreviewStoreState>((set) => ({
  ...initialState,
  setViewportPreset: (preset) =>
    set({
      viewport: {
        preset,
        ...VIEWPORT_PRESETS[preset],
      },
    }),
  setCustomViewport: (width, height) =>
    set({
      viewport: {
        preset: "custom",
        width: Math.max(240, Math.min(width, 2400)),
        height: Math.max(320, Math.min(height, 2400)),
      },
    }),
  toggleFitToContainer: () => set((state) => ({ fitToContainer: !state.fitToContainer })),
  toggleActualSize: () => set((state) => ({ actualSize: !state.actualSize })),
  setPhase: (phase) => set({ phase }),
  setDiagnostics: (input) => set(input),
  selectDiagnosticPath: (path) => set({ selectedDiagnosticPath: path }),
  markReportSubmitted: () => set({ reportSubmitted: true, reportError: null }),
  setReportError: (message) => set({ reportError: message }),
  reloadPreview: () =>
    set((state) => ({
      reloadToken: state.reloadToken + 1,
      phase: "preparing",
      reportSubmitted: false,
      reportError: null,
      compilationErrors: [],
      compilationWarnings: [],
      runtimeErrors: [],
      runtimeWarnings: [],
    })),
  reset: () => set(initialState),
}));

export function validateCustomViewport(width: number, height: number): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { ok: false, message: "Width and height must be numbers." };
  }

  if (width < 240 || width > 2400 || height < 320 || height > 2400) {
    return { ok: false, message: "Custom viewport must be between 240x320 and 2400x2400." };
  }

  return { ok: true };
}

export { VIEWPORT_PRESETS };
