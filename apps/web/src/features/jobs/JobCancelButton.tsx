import { useState } from "react";
import type { JobStatusResponse } from "@reactify/shared";
import { cancelJob } from "./job-api.js";
import { useJobStore } from "./jobStore.js";

interface JobCancelButtonProps {
  job: JobStatusResponse;
}

export function JobCancelButton({ job }: JobCancelButtonProps) {
  const upsertJob = useJobStore((state) => state.upsertJob);
  const [pending, setPending] = useState(false);

  if (!job.cancellationAllowed) {
    return null;
  }

  return (
    <button
      type="button"
      className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          const updated = await cancelJob(job.jobId);
          upsertJob(updated);
        } finally {
          setPending(false);
        }
      }}
    >
      Cancel
    </button>
  );
}
