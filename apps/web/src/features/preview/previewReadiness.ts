/**
 * Authoritative preview readiness model.
 *
 * Compile completion is not the same thing as a visible application. Each signal
 * below is tracked separately so the UI can never claim "Preview ready" while the
 * generated DOM is blank, and so unrelated failures (telemetry) cannot mark the
 * preview broken.
 */
export interface PreviewSignals {
  filesLoaded: boolean;
  providerMounted: boolean;
  bundlerConnected: boolean;
  compilationSucceeded: boolean;
  runtimeSucceeded: boolean;
  iframeLoaded: boolean;
  domRendered: boolean;
  fatalRuntimeError: string | null;
}

/** Document heights at or below this are an empty page, not a rendered app. */
export const MIN_RENDERED_DOCUMENT_HEIGHT = 24;

export const PREVIEW_SIGNAL_ORDER: Array<{
  key: keyof Omit<PreviewSignals, "fatalRuntimeError">;
  reason: string;
}> = [
  { key: "filesLoaded", reason: "Generated project files have not finished loading." },
  { key: "providerMounted", reason: "The Sandpack provider has not mounted yet." },
  { key: "bundlerConnected", reason: "The Sandpack bundler has not completed its handshake." },
  { key: "compilationSucceeded", reason: "The generated project has not compiled successfully." },
  { key: "runtimeSucceeded", reason: "The generated project has not started successfully." },
  { key: "iframeLoaded", reason: "The preview iframe has not loaded." },
  { key: "domRendered", reason: "The preview rendered no visible content." },
];

export interface PreviewReadiness {
  ready: boolean;
  /** Human readable reason the preview is not ready, or null when it is. */
  reason: string | null;
}

export function evaluatePreviewReadiness(signals: PreviewSignals): PreviewReadiness {
  if (signals.fatalRuntimeError) {
    return { ready: false, reason: signals.fatalRuntimeError };
  }

  for (const { key, reason } of PREVIEW_SIGNAL_ORDER) {
    if (!signals[key]) {
      return { ready: false, reason };
    }
  }

  return { ready: true, reason: null };
}

export function isDocumentHeightRendered(height: number | null | undefined): boolean {
  return typeof height === "number" && Number.isFinite(height) && height >= MIN_RENDERED_DOCUMENT_HEIGHT;
}
