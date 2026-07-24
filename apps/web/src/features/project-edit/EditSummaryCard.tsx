import type { EditOperationSummary } from "@reactify/generation-contracts";
import { shortenHash } from "./useProjectEdit";

interface EditSummaryCardProps {
  edit: EditOperationSummary;
}

export function EditSummaryCard({ edit }: EditSummaryCardProps) {
  return (
    <article className="rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-white">{edit.instruction}</h4>
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs uppercase tracking-wide">{edit.status}</span>
      </div>
      <dl className="mt-3 grid gap-1">
        <div className="flex justify-between gap-4">
          <dt>Version</dt>
          <dd>{edit.versionNumber ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Hash</dt>
          <dd>{shortenHash(edit.projectHashAfter ?? edit.projectHashBefore)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Changed files</dt>
          <dd>{edit.changedFiles.length}</dd>
        </div>
      </dl>
      {edit.failureReason ? <p className="mt-2 text-rose-200">{edit.failureReason}</p> : null}
    </article>
  );
}
