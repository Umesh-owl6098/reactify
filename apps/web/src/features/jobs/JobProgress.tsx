import type { JobStatusResponse } from "@reactify/shared";

const JOB_MESSAGES: Record<string, string> = {
  design_analysis: "Analyzing your screenshot",
  generation_plan_creation: "Creating the implementation plan",
  react_project_generation: "Generating React components",
  automatic_repair: "Repairing compilation errors",
  edit_intent_analysis: "Analyzing your requested edit",
  project_edit_generation: "Applying your requested edit",
  visual_correction: "Applying visual correction",
  export_preparation: "Preparing ZIP export",
};

interface JobProgressProps {
  job: JobStatusResponse;
}

export function JobProgress({ job }: JobProgressProps) {
  const label = job.progressMessage ?? JOB_MESSAGES[job.jobType] ?? "Processing";
  const showAttempt = job.attemptNumber > 1;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm text-slate-200">
        <span>{label}</span>
        <span>{job.progress}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={job.progress}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-indigo-400 transition-all" style={{ width: `${job.progress}%` }} />
      </div>
      {showAttempt ? (
        <p className="text-xs text-slate-400">Retry attempt {job.attemptNumber} of {job.maxAttempts}</p>
      ) : null}
    </div>
  );
}
