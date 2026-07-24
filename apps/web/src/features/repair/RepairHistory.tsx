import type { RepairStatusSnapshot } from "@reactify/generation-contracts";
import { RepairAttemptCard } from "./RepairAttemptCard";

interface RepairHistoryProps {
  repair: RepairStatusSnapshot | null | undefined;
}

export function RepairHistory({ repair }: RepairHistoryProps) {
  if (!repair || repair.repairHistory.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3" aria-labelledby="repair-history-heading">
      <h3 id="repair-history-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Repair history
      </h3>
      {repair.repairHistory.map((attempt) => (
        <RepairAttemptCard key={attempt.attemptNumber} attempt={attempt} />
      ))}
    </section>
  );
}
