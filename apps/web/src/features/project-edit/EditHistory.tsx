import type { EditOperationSummary } from "@reactify/generation-contracts";
import { EditSummaryCard } from "./EditSummaryCard";

interface EditHistoryProps {
  history: EditOperationSummary[];
}

export function EditHistory({ history }: EditHistoryProps) {
  if (history.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="edit-history-heading" className="space-y-3">
      <h3 id="edit-history-heading" className="text-sm font-semibold text-white">
        Edit history
      </h3>
      <div className="space-y-3">
        {history
          .slice()
          .reverse()
          .map((edit) => (
            <EditSummaryCard key={edit.editId} edit={edit} />
          ))}
      </div>
    </section>
  );
}
