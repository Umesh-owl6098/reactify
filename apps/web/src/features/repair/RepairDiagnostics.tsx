import type { RepairStatusSnapshot } from "@reactify/generation-contracts";

export function RepairDiagnostics({ repair }: { repair: RepairStatusSnapshot | null | undefined }) {
  if (!repair || repair.latestDiagnostics.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="repair-diagnostics-heading">
      <h3 id="repair-diagnostics-heading" className="text-sm font-semibold text-slate-300">
        Diagnostics
      </h3>
      <ul className="mt-2 space-y-2">
        {repair.latestDiagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${index}`} className="text-sm text-slate-200">
            [{diagnostic.severity}] {diagnostic.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
