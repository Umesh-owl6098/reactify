import type { UsageOperationSummary } from "@reactify/shared";
import { UsageOperationCard } from "./UsageOperationCard";

export function UsageOperationList({ items }: { items: UsageOperationSummary[] }) {
  return (
    <section aria-labelledby="usage-operations-heading" className="space-y-4">
      <h2 id="usage-operations-heading" className="text-xl font-semibold">
        Recent AI operations
      </h2>
      {items.length === 0 ? (
        <p className="text-slate-400">No AI operations recorded for this period yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((operation) => (
            <li key={operation.usageId}>
              <UsageOperationCard operation={operation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
