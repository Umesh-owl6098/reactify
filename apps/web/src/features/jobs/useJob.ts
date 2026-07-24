import { useCallback, useEffect, useRef } from "react";
import type { JobStatusResponse } from "@reactify/shared";
import { fetchGenerationJobs, fetchJobStatus, isTerminalJobStatus } from "./job-api.js";
import { useJobStore } from "./jobStore.js";

const ACTIVE_POLL_MS = 1500;
const WAITING_POLL_MS = 4000;
const HIDDEN_POLL_MS = 8000;
const GENERATION_JOBS_POLL_MS = 3000;

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

function pickActiveJob(jobs: JobStatusResponse[]): JobStatusResponse | null {
  return (
    jobs.find((job) => ["queued", "claimed", "running", "retry_scheduled"].includes(job.status)) ??
    jobs.find((job) => job.status === "waiting_for_client") ??
    jobs.find((job) => ["failed", "dead_letter"].includes(job.status)) ??
    null
  );
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

export function useGenerationJobs(generationId: string | null) {
  const upsertJob = useJobStore((state) => state.upsertJob);
  const setActiveJobId = useJobStore((state) => state.setActiveJobId);
  const jobs = useJobStore((state) => Object.values(state.jobs));

  const refresh = useCallback(async () => {
    if (!generationId) {
      return;
    }

    try {
      const response = await fetchGenerationJobs(generationId);
      for (const job of response.items) {
        upsertJob(job);
      }

      const active = pickActiveJob(response.items);
      setActiveJobId(active?.jobId ?? null);
    } catch {
      // Job polling errors should not blank the generation page.
    }
  }, [generationId, setActiveJobId, upsertJob]);

  useEffect(() => {
    if (!generationId) {
      setActiveJobId(null);
      return;
    }

    void refresh();
    const intervalId = window.setInterval(() => {
      void refresh();
    }, GENERATION_JOBS_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [generationId, refresh, setActiveJobId]);

  return { jobs, refresh };
}
