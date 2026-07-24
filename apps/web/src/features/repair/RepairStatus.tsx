import type { RepairStatusSnapshot } from "@reactify/generation-contracts";

const STATUS_LABELS: Record<RepairStatusSnapshot["repairStatus"], string> = {
  not_required: "Repair not required",
  analyzing: "Analyzing diagnostics",
  generating_patch: "Generating patch",
  validating_patch: "Validating patch",
  applying_patch: "Applying patch",
  waiting_for_revalidation: "Revalidating preview",
  succeeded: "Repair succeeded",
  failed: "Repair failed",
  exhausted: "Repair attempts exhausted",
  not_possible: "Repair not possible",
};

interface RepairStatusProps {
  repair: RepairStatusSnapshot | null | undefined;
  onManualRetry?: () => void;
}

export function RepairStatusPanel({ repair, onManualRetry }: RepairStatusProps) {
  if (!repair || repair.repairStatus === "not_required") {
    return null;
  }

  return (
    <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4" aria-live="polite">
      <h3 className="text-sm font-semibold text-amber-100">Automatic repair</h3>
      <p className="mt-1 text-sm text-amber-50">{STATUS_LABELS[repair.repairStatus]}</p>
      <p className="mt-2 text-xs text-amber-100/90">
        Attempt {repair.currentAttempt} of {repair.maxAttempts}
      </p>
      {repair.latestPatchSummary ? (
        <p className="mt-2 text-sm text-amber-50">{repair.latestPatchSummary}</p>
      ) : null}
      {repair.unresolvedRisks.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100">
          {repair.unresolvedRisks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      ) : null}
      {repair.manualRetryAllowed && onManualRetry ? (
        <button
          type="button"
          className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-sm text-white"
          onClick={onManualRetry}
        >
          Retry repair
        </button>
      ) : null}
    </section>
  );
}
