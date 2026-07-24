import { useState } from "react";
import type { JobStatusResponse } from "@reactify/shared";
import { fetchJobStatus, retryJob } from "./job-api.js";
import { useJobStore } from "./jobStore.js";

interface JobRetryButtonProps {
  job: JobStatusResponse;
}

export function JobRetryButton({ job }: JobRetryButtonProps) {
  const upsertJob = useJobStore((state) => state.upsertJob);
  const setActiveJobId = useJobStore((state) => state.setActiveJobId);
  const [pending, setPending] = useState(false);

  if (!["failed", "dead_letter"].includes(job.status)) {
    return null;
  }

  return (
    <button
      type="button"
      className="rounded-lg border border-indigo-400/40 px-3 py-1 text-xs text-indigo-100 hover:bg-indigo-500/10 disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const accepted = await retryJob(job.jobId);
          const next = await fetchJobStatus(accepted.jobId);
          upsertJob(next);
          setActiveJobId(accepted.jobId);
        } finally {
          setPending(false);
        }
      }}
    >
      Retry
    </button>
  );
}
