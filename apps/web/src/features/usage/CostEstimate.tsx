import type { AiEstimateResponse } from "@reactify/shared";

function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(value);
}

export function CostEstimate({ estimate, labelId }: { estimate: AiEstimateResponse; labelId?: string }) {
  return (
    <div aria-labelledby={labelId} className="rounded-lg border border-slate-700 bg-slate-900/60 p-3 text-sm text-slate-200">
      <p id={labelId} className="font-medium">
        Estimated AI usage
      </p>
      <ul className="mt-2 space-y-1 text-slate-300">
        <li>Approximately {estimate.estimatedInputTokens.toLocaleString()} input tokens</li>
        <li>Up to {estimate.estimatedOutputTokens.toLocaleString()} output tokens</li>
        <li>Estimated cost: {formatUsd(estimate.estimatedCostUsd)}</li>
      </ul>
    </div>
  );
}
