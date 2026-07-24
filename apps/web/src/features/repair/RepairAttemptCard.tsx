import type { RepairHistorySummary } from "@reactify/generation-contracts";

export function RepairAttemptCard({ attempt }: { attempt: RepairHistorySummary }) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <p className="text-sm font-medium text-white">
        Attempt {attempt.attemptNumber} · {attempt.status}
      </p>
      {attempt.patchSummary ? <p className="mt-1 text-sm text-slate-300">{attempt.patchSummary}</p> : null}
      <p className="mt-1 text-xs text-slate-400">{attempt.changedFileCount} changed file(s)</p>
      {attempt.failureReason ? <p className="mt-2 text-sm text-red-200">{attempt.failureReason}</p> : null}
    </article>
  );
}
