import type { UsageOperationSummary } from "@reactify/shared";

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function UsageOperationCard({ operation }: { operation: UsageOperationSummary }) {
  const actualCost = operation.actualCostUsd ?? operation.estimatedCostUsd;
  return (
    <article className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium capitalize">{operation.operationType.replaceAll("_", " ")}</h3>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs uppercase">{operation.status}</span>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Estimated cost</dt>
          <dd>{formatUsd(operation.estimatedCostUsd)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Actual cost</dt>
          <dd>{formatUsd(actualCost)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Tokens</dt>
          <dd>
            {(operation.actualInputTokens ?? operation.estimatedInputTokens).toLocaleString()} in /{" "}
            {(operation.actualOutputTokens ?? operation.estimatedOutputTokens).toLocaleString()} out
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">When</dt>
          <dd>{new Date(operation.createdAt).toLocaleString()}</dd>
        </div>
      </dl>
    </article>
  );
}
