import type { UsageLimitStatus } from "@reactify/shared";

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function UsageProgress({ limits }: { limits: UsageLimitStatus }) {
  const budgetPercent =
    limits.monthlyBudgetUsd && limits.monthlyBudgetUsd > 0
      ? Math.min(100, ((limits.usedBudgetUsd + limits.reservedBudgetUsd) / limits.monthlyBudgetUsd) * 100)
      : null;

  const tokenPercent =
    limits.monthlyTokenLimit && limits.monthlyTokenLimit > 0
      ? Math.min(100, ((limits.usedTokens + limits.reservedTokens) / limits.monthlyTokenLimit) * 100)
      : null;

  return (
    <section aria-labelledby="usage-progress-heading" className="space-y-4">
      <h2 id="usage-progress-heading" className="text-xl font-semibold">
        Allowance progress
      </h2>

      {budgetPercent === null ? (
        <p className="text-slate-300">Monthly budget: unlimited</p>
      ) : (
        <div>
          <div className="flex justify-between text-sm text-slate-300">
            <span>Monthly budget used</span>
            <span aria-live="polite">{Math.round(budgetPercent)}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(budgetPercent)}
            aria-label="Monthly AI budget usage"
            className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800"
          >
            <div className="h-full bg-indigo-500" style={{ width: `${budgetPercent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Remaining: {formatUsd(limits.remainingBudgetUsd ?? 0)} (reserved: {formatUsd(limits.reservedBudgetUsd)})
          </p>
        </div>
      )}

      {tokenPercent === null ? (
        <p className="text-slate-300">Monthly tokens: unlimited</p>
      ) : (
        <div>
          <div className="flex justify-between text-sm text-slate-300">
            <span>Monthly tokens used</span>
            <span aria-live="polite">{Math.round(tokenPercent)}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(tokenPercent)}
            aria-label="Monthly token allowance usage"
            className="mt-2 h-3 overflow-hidden rounded-full bg-slate-800"
          >
            <div className="h-full bg-emerald-500" style={{ width: `${tokenPercent}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Remaining tokens: {(limits.remainingTokens ?? 0).toLocaleString()} (reserved:{" "}
            {limits.reservedTokens.toLocaleString()})
          </p>
        </div>
      )}
    </section>
  );
}
