import { useCallback, useEffect, useRef } from "react";
import type { JobStatusResponse } from "@reactify/shared";
import { fetchJobStatus, isTerminalJobStatus } from "./job-api.js";
import { useJobStore } from "./jobStore.js";

const ACTIVE_POLL_MS = 1500;
const WAITING_POLL_MS = 4000;
const HIDDEN_POLL_MS = 8000;

function pollIntervalFor(status: JobStatusResponse | null, hidden: boolean): number | null {
  if (!status || isTerminalJobStatus(status.status)) {
    return null;
  }

  if (hidden) {
    return HIDDEN_POLL_MS;
  }

  if (status.status === "waiting_for_client") {
    return WAITING_POLL_MS;
  }

  return ACTIVE_POLL_MS;
}

export function useJob(jobId: string | null) {
  const job = useJobStore((state) => (jobId ? state.jobs[jobId] ?? null : null));
  const upsertJob = useJobStore((state) => state.upsertJob);
  const pollingRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!jobId) {
      return null;
    }

    const next = await fetchJobStatus(jobId);
    upsertJob(next);
    return next;
  }, [jobId, upsertJob]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        if (cancelled) {
          return;
        }
        await refresh();
      } catch {
        // polling errors are surfaced by parent views
      }
    };

    void tick();

    const schedule = () => {
      if (pollingRef.current) {
        window.clearTimeout(pollingRef.current);
      }

      const hidden = document.visibilityState === "hidden";
      const interval = pollIntervalFor(useJobStore.getState().jobs[jobId] ?? null, hidden);
      if (interval === null) {
        return;
      }

      pollingRef.current = window.setTimeout(() => {
        void tick().finally(schedule);
      }, interval);
    };

    schedule();
    const onVisibility = () => schedule();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (pollingRef.current) {
        window.clearTimeout(pollingRef.current);
      }
    };
  }, [jobId, refresh]);

  return { job, refresh };
}

export function useGenerationJobs(_generationId: string | null) {
  const jobs = useJobStore((state) => Object.values(state.jobs));
  return { jobs };
}
