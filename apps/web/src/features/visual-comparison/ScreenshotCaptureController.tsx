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
  const inFlightRef = useRef(false);
  const projectHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (status.projectHash !== projectHashRef.current) {
      projectHashRef.current = status.projectHash;
      inFlightRef.current = false;
    }
  }, [status.projectHash]);

  useEffect(() => {
    if (!enabled || !status.previewCaptureRequired || !comparisonId || inFlightRef.current) {
      return;
    }

    let cancelled = false;
    inFlightRef.current = true;
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

    async function capture() {
      const { capturePreviewScreenshot } = await import("./capturePreviewScreenshot");
      const root = await waitForPreviewRoot();
      if (cancelled) {
        return;
      }

      if (!root) {
        inFlightRef.current = false;
        onCaptureError(
          "Sandpack preview was not ready for screenshot capture. Ensure the preview is visible, then retry.",
        );
        return;
      }

      try {
        const screenshotBase64 = await capturePreviewScreenshot(root);
        if (!cancelled) {
          await onCapture(screenshotBase64);
        }
      } catch (error) {
        if (!cancelled) {
          inFlightRef.current = false;
          onCaptureError(
            error instanceof Error
              ? error.message
              : "Preview screenshot capture failed. The Sandpack iframe may be inaccessible.",
          );
        }
      }
    }

    void capture();

    const timeoutId = window.setTimeout(() => {
      if (!cancelled && inFlightRef.current) {
        cancelled = true;
        inFlightRef.current = false;
        onCaptureError("Preview screenshot capture timed out. Retry after the Sandpack preview finishes loading.");
      }
    }, CAPTURE_HARD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    captureAttempt,
    comparisonId,
    enabled,
    onCapture,
    onCaptureError,
    status.previewCaptureRequired,
  ]);

  return null;
}
