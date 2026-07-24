import type { JobStatusResponse } from "@reactify/shared";
import { JobProgress } from "./JobProgress.js";
import { JobFailure } from "./JobFailure.js";
import { JobCancelButton } from "./JobCancelButton.js";
import { JobRetryButton } from "./JobRetryButton.js";

interface JobStatusProps {
  job: JobStatusResponse | null;
}

export function JobStatus({ job }: JobStatusProps) {
  if (!job) {
    return null;
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/50 p-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Background operation</p>
          <p className="text-xs uppercase tracking-wide text-slate-400">{job.jobType.replaceAll("_", " ")}</p>
        </div>
        <div className="flex gap-2">
          <JobCancelButton job={job} />
          <JobRetryButton job={job} />
        </div>
      </div>
      <JobProgress job={job} />
      <JobFailure job={job} />
    </section>
  );
}
