import { useEffect, useRef } from "react";
import { useSandpack } from "@codesandbox/sandpack-react";
import { SANDPACK_BUNDLER_CONNECTION_TIMEOUT_MS } from "./sandpackConfig";
import { isDocumentHeightRendered, type PreviewSignals } from "./previewReadiness";
import { usePreviewStore } from "./previewStore";
import { logSandbox } from "./sandboxLogger";

interface SandpackConnectionMonitorProps {
  enabled: boolean;
}

const IFRAME_POLL_INTERVAL_MS = 250;

export interface BundlerMessage {
  type: string;
  height?: number;
  compilatonError?: boolean;
  action?: string;
  message?: string;
}

type PreviewSignalPatch = Partial<PreviewSignals & { documentHeight: number | null }>;

interface BundlerMessageHandlers {
  markConnected: () => void;
  setPreviewSignals: (signals: PreviewSignalPatch) => void;
}

/** Exported for tests: maps one raw bundler message onto preview signals. */
export function applyBundlerMessage(message: BundlerMessage, handlers: BundlerMessageHandlers): void {
  const { markConnected, setPreviewSignals } = handlers;

  switch (message.type) {
    case "initialized":
    case "connected":
      markConnected();
      setPreviewSignals({ bundlerConnected: true });
      break;
    case "start":
      markConnected();
      setPreviewSignals({
        bundlerConnected: true,
        compilationSucceeded: false,
        runtimeSucceeded: false,
        domRendered: false,
        documentHeight: null,
        fatalRuntimeError: null,
      });
      break;
    case "done": {
      markConnected();
      const compilationSucceeded = message.compilatonError !== true;
      setPreviewSignals({
        bundlerConnected: true,
        compilationSucceeded,
        runtimeSucceeded: compilationSucceeded,
      });
      logSandbox("bundler_done", { compilationSucceeded });
      break;
    }
    case "resize": {
      const height = typeof message.height === "number" ? message.height : null;
      setPreviewSignals({
        documentHeight: height,
        domRendered: isDocumentHeightRendered(height),
      });
      break;
    }
    case "action":
      if (message.action === "show-error") {
        setPreviewSignals({
          fatalRuntimeError: message.message ?? "The generated application threw a fatal runtime error.",
          runtimeSucceeded: false,
        });
      }
      break;
    default:
      break;
  }
}

/**
 * Translates raw bundler traffic into the authoritative preview signals.
 *
 * The preview iframe is served from the bundler origin, so the parent frame can
 * never read its DOM. The bundler's own `resize` messages carry the rendered
 * document height, which is the only trustworthy cross-origin proof that
 * something is actually painted.
 */
export function SandpackConnectionMonitor({ enabled }: SandpackConnectionMonitorProps) {
  const { sandpack, listen } = useSandpack();
  const setPreviewConnected = usePreviewStore((state) => state.setPreviewConnected);
  const setBundlerUnavailable = usePreviewStore((state) => state.setBundlerUnavailable);
  const setPreviewSignals = usePreviewStore((state) => state.setPreviewSignals);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setPreviewSignals({ providerMounted: true });
  }, [enabled, setPreviewSignals]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (typeof listen !== "function") {
      return;
    }

    const unsubscribe = listen((message) => {
      applyBundlerMessage(message as unknown as BundlerMessage, {
        markConnected: () => {
          connectedRef.current = true;
          setBundlerUnavailable(null);
        },
        setPreviewSignals,
      });
    });

    return unsubscribe;
  }, [enabled, listen, setBundlerUnavailable, setPreviewSignals]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    connectedRef.current = false;
    setPreviewConnected(false);
    setBundlerUnavailable(null);

    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const iframe = document.querySelector<HTMLIFrameElement>("[data-sandpack-preview-root] iframe");
      const iframeLoaded = Boolean(iframe && iframe.clientWidth > 0 && iframe.clientHeight > 0);
      setPreviewSignals({ iframeLoaded });

      const sandpackReady = sandpack.status === "idle" || sandpack.status === "running";
      if (sandpackReady && iframeLoaded) {
        connectedRef.current = true;
        setPreviewConnected(true);
        setBundlerUnavailable(null);
        window.clearInterval(intervalId);
        return;
      }

      if (Date.now() - startedAt >= SANDPACK_BUNDLER_CONNECTION_TIMEOUT_MS) {
        if (!connectedRef.current) {
          setPreviewConnected(false);
          setBundlerUnavailable(
            "Preview service unavailable. The Sandpack bundler did not connect in time. Check network access or configure VITE_SANDPACK_BUNDLER_URL for a local bundler.",
          );
        }
        window.clearInterval(intervalId);
      }
    }, IFRAME_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, sandpack.status, setBundlerUnavailable, setPreviewConnected, setPreviewSignals]);

  return null;
}
