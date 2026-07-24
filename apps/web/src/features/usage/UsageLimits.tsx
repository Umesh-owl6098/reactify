import type { UsageLimitStatus } from "@reactify/shared";

function formatUsd(value: number | null): string {
  if (value === null) {
    return "Unlimited";
  }
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function UsageLimits({ limits }: { limits: UsageLimitStatus }) {
  return (
    <section aria-labelledby="usage-limits-heading" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 id="usage-limits-heading" className="text-xl font-semibold">
        Limits
      </h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-400">Monthly budget</dt>
          <dd>{formatUsd(limits.monthlyBudgetUsd)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Monthly token limit</dt>
          <dd>{limits.monthlyTokenLimit?.toLocaleString() ?? "Unlimited"}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Next reset</dt>
          <dd>{new Date(limits.nextResetAt).toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}
