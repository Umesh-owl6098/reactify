import { useEffect, useRef } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";

export const CAPTURE_HARD_TIMEOUT_MS = 45_000;
export const CAPTURE_PREVIEW_POLL_MS = 250;

interface ScreenshotCaptureControllerProps {
  status: GenerationStatusResponse;
  comparisonId: string | null;
  enabled: boolean;
  captureAttempt: number;
  onCapture: (screenshotBase64: string) => Promise<void>;
  onCaptureError: (message: string) => void;
}

export function ScreenshotCaptureController({
  status,
  comparisonId,
  enabled,
  captureAttempt,
  onCapture,
  onCaptureError,
}: ScreenshotCaptureControllerProps) {
  // The status poll re-renders this component every couple of seconds with new
  // callback identities. The capture lifecycle must not restart or cancel on
  // that churn, so callbacks live in a ref and the effect keys off a stable
  // capture identity instead of the callbacks.
  const callbacksRef = useRef({ onCapture, onCaptureError });
  callbacksRef.current = { onCapture, onCaptureError };

  const startedKeyRef = useRef<string | null>(null);

  const captureKey =
    enabled && status.previewCaptureRequired && comparisonId
      ? `${comparisonId}:${captureAttempt}:${status.projectHash ?? ""}`
      : null;

  useEffect(() => {
    if (!captureKey || startedKeyRef.current === captureKey) {
      return;
    }
    startedKeyRef.current = captureKey;

    let cancelled = false;
    const startedAt = Date.now();

    async function waitForPreviewRoot(): Promise<HTMLElement | null> {
      while (!cancelled && Date.now() - startedAt < CAPTURE_HARD_TIMEOUT_MS) {
        const root = document.querySelector<HTMLElement>("[data-sandpack-preview-root]");
        if (root && root.offsetWidth > 0 && root.offsetHeight > 0) {
          return root;
        }
        await new Promise((resolve) => setTimeout(resolve, CAPTURE_PREVIEW_POLL_MS));
      }
      return null;
    }

    async function run() {
      try {
        const { capturePreviewScreenshot } = await import("./capturePreviewScreenshot");
        const root = await waitForPreviewRoot();
        if (cancelled) {
          return;
        }

        if (!root) {
          callbacksRef.current.onCaptureError(
            "Sandpack preview was not ready for screenshot capture. Ensure the preview is visible, then retry.",
          );
          return;
        }

        // html-to-image can hang on unreachable fonts or images; race it
        // against the remaining capture budget so the UI always resolves.
        const remainingMs = Math.max(5_000, CAPTURE_HARD_TIMEOUT_MS - (Date.now() - startedAt));
        const screenshotBase64 = await Promise.race([
          capturePreviewScreenshot(root),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    "Preview screenshot capture timed out. Retry after the Sandpack preview finishes loading.",
                  ),
                ),
              remainingMs,
            ),
          ),
        ]);
        if (!cancelled) {
          await callbacksRef.current.onCapture(screenshotBase64);
        }
      } catch (error) {
        if (!cancelled) {
          callbacksRef.current.onCaptureError(
            error instanceof Error
              ? error.message
              : "Preview screenshot capture failed. The Sandpack iframe may be inaccessible.",
          );
        }
      }
    }

    void run();

    // Cleanup runs only when the capture identity changes (a retry or a new
    // comparison) or on unmount — never on status-poll re-renders.
    return () => {
      cancelled = true;
      if (startedKeyRef.current === captureKey) {
        startedKeyRef.current = null;
      }
    };
  }, [captureKey]);

  return null;
}
