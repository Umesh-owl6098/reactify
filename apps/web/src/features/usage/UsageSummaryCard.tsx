import type { UsageSummary } from "@reactify/shared";

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function UsageSummaryCard({ summary }: { summary: UsageSummary }) {
  return (
    <section aria-labelledby="usage-summary-heading" className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 id="usage-summary-heading" className="text-xl font-semibold">
        Current billing period
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        UTC month: {new Date(summary.periodStart).toLocaleDateString()} –{" "}
        {new Date(summary.periodEnd).toLocaleDateString()}
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-400">Input tokens</dt>
          <dd className="text-lg font-medium">{summary.inputTokens.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Output tokens</dt>
          <dd className="text-lg font-medium">{summary.outputTokens.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Actual cost</dt>
          <dd className="text-lg font-medium">{formatUsd(summary.actualCostUsd)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Estimated total (incl. reserved)</dt>
          <dd className="text-lg font-medium">{formatUsd(summary.estimatedCostUsd)}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Operations</dt>
          <dd className="text-lg font-medium">{summary.operationCount}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-400">Failed operations</dt>
          <dd className="text-lg font-medium">{summary.failedOperationCount}</dd>
        </div>
      </dl>
    </section>
  );
}
