import { Navigate, useLocation } from "react-router-dom";
import { isSessionFailure, isSessionLoading } from "./session-status.js";
import { useSession } from "./useSession.js";

function SessionLoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <p role="status">Restoring your session…</p>
    </div>
  );
}

function SessionErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
      <div className="max-w-md space-y-4">
        <p role="alert">Failed to load session.</p>
        <p className="text-sm text-slate-400">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
        >
          Retry session check
        </button>
      </div>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isInitialized, isLoading, sessionStatus, sessionError, restoreSession } = useSession();

  if (isSessionLoading(sessionStatus, isInitialized) || isLoading) {
    return <SessionLoadingState />;
  }

  if (isSessionFailure(sessionStatus) && sessionError) {
    return <SessionErrorState message={sessionError} onRetry={() => void restoreSession()} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return children;
}
