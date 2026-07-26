import { useMemo } from "react";
import { evaluatePreviewReadiness, type PreviewReadiness } from "./previewReadiness";
import { usePreviewStore } from "./previewStore";

/**
 * Subscribes to each readiness signal individually so the returned object stays
 * referentially stable while nothing changed.
 */
export function usePreviewReadiness(): PreviewReadiness {
  const filesLoaded = usePreviewStore((state) => state.filesLoaded);
  const providerMounted = usePreviewStore((state) => state.providerMounted);
  const bundlerConnected = usePreviewStore((state) => state.bundlerConnected);
  const compilationSucceeded = usePreviewStore((state) => state.compilationSucceeded);
  const runtimeSucceeded = usePreviewStore((state) => state.runtimeSucceeded);
  const iframeLoaded = usePreviewStore((state) => state.iframeLoaded);
  const domRendered = usePreviewStore((state) => state.domRendered);
  const fatalRuntimeError = usePreviewStore((state) => state.fatalRuntimeError);

  return useMemo(
    () =>
      evaluatePreviewReadiness({
        filesLoaded,
        providerMounted,
        bundlerConnected,
        compilationSucceeded,
        runtimeSucceeded,
        iframeLoaded,
        domRendered,
        fatalRuntimeError,
      }),
    [
      bundlerConnected,
      compilationSucceeded,
      domRendered,
      fatalRuntimeError,
      filesLoaded,
      iframeLoaded,
      providerMounted,
      runtimeSucceeded,
    ],
  );
}
