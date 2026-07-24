import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "./useSession";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isInitialized, isLoading } = useSession();

  if (!isInitialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <p role="status">Loading your session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  }

  return children;
}
