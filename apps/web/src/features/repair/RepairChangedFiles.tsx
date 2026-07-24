import type {
  RepairAttemptDetailResponse,
  RepairStatusSnapshot,
} from "@reactify/generation-contracts";
import { createUnifiedDiff } from "./formatUnifiedDiff";

interface RepairChangedFilesProps {
  repair: RepairStatusSnapshot | null | undefined;
  attemptDetail: RepairAttemptDetailResponse | null;
}

export function RepairChangedFiles({ repair, attemptDetail }: RepairChangedFilesProps) {
  if (!repair || repair.changedFiles.length === 0) {
    return null;
  }

  const changedFileRecords = attemptDetail?.attempt.changedFiles ?? [];

  return (
    <section aria-labelledby="repair-changed-files-heading" className="space-y-4">
      <h3 id="repair-changed-files-heading" className="text-sm font-semibold text-slate-300">
        Changed files
      </h3>
      <ul className="space-y-4">
        {repair.changedFiles.map((path) => {
          const record = changedFileRecords.find((file) => file.path === path);
          const before = record?.beforeContent ?? "";
          const after = record?.afterContent ?? record?.fullContent ?? "";
          const { diff, truncated } = createUnifiedDiff(before, after, path);

          return (
            <li key={path} className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm font-medium text-white">{path}</p>
              {record?.reason ? <p className="mt-1 text-sm text-slate-300">{record.reason}</p> : null}
              <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-200">
                {diff}
              </pre>
              {truncated ? <p className="mt-2 text-xs text-slate-400">Large diff truncated for safety.</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
