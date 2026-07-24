import { useEffect, useState } from "react";
import { AuthApiError, fetchActiveSessions, revokeSession } from "../auth/authApi";
import type { ActiveSessionSummary } from "@reactify/shared";

export function SessionList() {
  const [sessions, setSessions] = useState<ActiveSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadSessions() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetchActiveSessions();
      setSessions(response.sessions);
    } catch (loadError) {
      setError(loadError instanceof AuthApiError ? loadError.message : "Failed to load sessions.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function handleRevoke(sessionId: string) {
    await revokeSession(sessionId);
    await loadSessions();
  }

  if (isLoading) {
    return <p role="status">Loading active sessions…</p>;
  }

  return (
    <div className="space-y-3">
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      <ul className="space-y-3">
        {sessions.map((session) => (
          <li key={session.sessionId} className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-100">{session.deviceLabel}</p>
                <p className="text-sm text-slate-400">
                  Last active {session.lastUsedAt ? new Date(session.lastUsedAt).toLocaleString() : "recently"}
                </p>
              </div>
              {!session.currentSession ? (
                <button
                  type="button"
                  onClick={() => void handleRevoke(session.sessionId)}
                  className="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
                >
                  Revoke session
                </button>
              ) : (
                <span className="text-sm text-emerald-300">Current session</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
