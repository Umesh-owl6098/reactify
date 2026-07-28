import { useCallback, useEffect, useState } from "react";
import type {
  GenerationStatusResponse,
  ProjectVersionSummary,
} from "@reactify/generation-contracts";
import { fetchVersionHistory, rollbackToVersion } from "../../lib/generation-api";

interface VersionHistoryPanelProps {
  status: GenerationStatusResponse;
  onRefreshStatus: () => void;
}

const SOURCE_LABELS: Record<ProjectVersionSummary["source"], string> = {
  initial_generation: "Initial generation",
  automatic_repair: "Automatic repair",
  rollback: "Rollback",
  natural_language_edit: "AI edit",
  visual_correction: "Visual correction",
};

export function VersionHistoryPanel({ status, onRefreshStatus }: VersionHistoryPanelProps) {
  const [versions, setVersions] = useState<ProjectVersionSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [pendingVersionId, setPendingVersionId] = useState<string | null>(null);

  const generationId = status.id;
  const projectHash = status.projectHash;

  const loadVersions = useCallback(async () => {
    try {
      const response = await fetchVersionHistory(generationId);
      setVersions(response.versions);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to fetch version history.");
    }
  }, [generationId]);

  useEffect(() => {
    void loadVersions();
    // Reload whenever a mutation lands a new active version.
  }, [loadVersions, status.activeVersionNumber, projectHash]);

  const handleRollback = useCallback(
    async (versionId: string) => {
      if (!projectHash || pendingVersionId) {
        return;
      }
      setPendingVersionId(versionId);
      setRollbackError(null);
      try {
        await rollbackToVersion(generationId, versionId, projectHash);
        await loadVersions();
        onRefreshStatus();
      } catch (error) {
        setRollbackError(
          error instanceof Error ? error.message : "Failed to roll back to the selected version.",
        );
      } finally {
        setPendingVersionId(null);
      }
    },
    [generationId, loadVersions, onRefreshStatus, pendingVersionId, projectHash],
  );

  if (versions.length === 0 && !loadError) {
    return null;
  }

  return (
    <section
      className="space-y-4 rounded-2xl border border-sky-400/30 bg-sky-500/5 p-5"
      aria-labelledby="version-history-heading"
    >
      <div>
        <h2 id="version-history-heading" className="text-lg font-semibold text-white">
          Version history
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Every generation, repair, edit, and correction creates an immutable version. Roll back to
          restore an earlier version as a new active version.
        </p>
      </div>

      {loadError ? (
        <div className="space-y-2 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3" role="alert">
          <p className="text-sm text-rose-100">{loadError}</p>
          <button
            type="button"
            className="rounded-lg border border-rose-300/50 px-3 py-1.5 text-sm text-rose-50"
            onClick={() => void loadVersions()}
          >
            Retry
          </button>
        </div>
      ) : null}

      {rollbackError ? (
        <p className="text-sm text-rose-200" role="alert">
          {rollbackError}
        </p>
      ) : null}

      <ol className="space-y-2">
        {[...versions]
          .sort((a, b) => b.versionNumber - a.versionNumber)
          .map((version) => (
            <li
              key={version.versionId}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                version.isActive
                  ? "border-emerald-400/50 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-950/60"
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-white">
                  v{version.versionNumber} · {SOURCE_LABELS[version.source]}
                  {version.isActive ? (
                    <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200">
                      Active
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {version.instruction ?? version.label} ·{" "}
                  {new Date(version.createdAt).toLocaleString()} · {version.changedFiles.length}{" "}
                  file{version.changedFiles.length === 1 ? "" : "s"} changed
                </p>
              </div>
              {!version.isActive ? (
                <button
                  type="button"
                  className="rounded-lg border border-sky-300/50 px-3 py-1.5 text-sm text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pendingVersionId !== null || !projectHash}
                  aria-label={`Roll back to version ${version.versionNumber}`}
                  onClick={() => void handleRollback(version.versionId)}
                >
                  {pendingVersionId === version.versionId ? "Rolling back…" : "Roll back"}
                </button>
              ) : null}
            </li>
          ))}
      </ol>
    </section>
  );
}
