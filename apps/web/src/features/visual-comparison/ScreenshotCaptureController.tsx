import { useEffect, useRef } from "react";
import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { capturePreviewScreenshot } from "./capturePreviewScreenshot";

interface ScreenshotCaptureControllerProps {
  status: GenerationStatusResponse;
  enabled: boolean;
  onCapture: (screenshotBase64: string) => Promise<void>;
}

export function ScreenshotCaptureController({ status, enabled, onCapture }: ScreenshotCaptureControllerProps) {
  const captureStartedRef = useRef(false);
  const projectHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (status.projectHash !== projectHashRef.current) {
      projectHashRef.current = status.projectHash;
      captureStartedRef.current = false;
    }
  }, [status.projectHash]);

  useEffect(() => {
    if (!enabled || !status.previewCaptureRequired || captureStartedRef.current) {
      return;
    }

    let cancelled = false;
    captureStartedRef.current = true;

    async function capture() {
      const root = document.querySelector<HTMLElement>("[data-sandpack-preview-root]");
      if (!root) {
        return;
      }

      try {
        const screenshotBase64 = await capturePreviewScreenshot(root);
        if (!cancelled) {
          await onCapture(screenshotBase64);
        }
      } catch {
        captureStartedRef.current = false;
      }
    }

    void capture();

    return () => {
      cancelled = true;
    };
  }, [enabled, onCapture, status.previewCaptureRequired]);

  return null;
}
