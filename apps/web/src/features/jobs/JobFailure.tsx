import type { JobStatusResponse } from "@reactify/shared";

interface JobFailureProps {
  job: JobStatusResponse;
}

export function JobFailure({ job }: JobFailureProps) {
  if (!job.failureMessage || job.status === "completed") {
    return null;
  }

  return (
    <p className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200" role="alert">
      {job.failureMessage}
    </p>
  );
}
