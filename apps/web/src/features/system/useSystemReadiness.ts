import { useEffect, useState } from "react";
import { apiJson } from "../../lib/api-client.js";

interface SystemReadinessResponse {
  workerAvailable: boolean;
  inlineExecution: boolean;
  registeredJobTypes: string[];
  message: string | null;
}

const READINESS_POLL_MS = 15_000;

export function useSystemReadiness() {
  const [readiness, setReadiness] = useState<SystemReadinessResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;
    let failureCount = 0;

    const refresh = async () => {
      try {
        const next = await apiJson<SystemReadinessResponse>("/api/v1/system/readiness");
        if (!cancelled) {
          setReadiness(next);
          failureCount = 0;
        }
      } catch {
        if (!cancelled) {
          setReadiness({
            workerAvailable: false,
            inlineExecution: false,
            registeredJobTypes: [],
            message: "Unable to reach the API readiness endpoint.",
          });
          failureCount += 1;
        }
      } finally {
        if (!cancelled) {
          const delay = Math.min(READINESS_POLL_MS * 2 ** Math.min(failureCount, 3), 60_000);
          timeoutId = window.setTimeout(() => {
            void refresh();
          }, document.visibilityState === "hidden" ? delay * 2 : delay);
        }
      }
    };

    void refresh();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  return readiness;
}
