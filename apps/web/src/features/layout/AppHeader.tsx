import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../auth/useSession";
import { isAuthDisabled } from "../auth/authMode";
import { startNewGeneration } from "../generation/startNewGeneration";

export function AppHeader() {
  const navigate = useNavigate();
  const authDisabled = isAuthDisabled();
  const { user } = useSession();

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-semibold text-white">
          Reactify
        </Link>
        <div className="flex items-center gap-4 text-sm text-slate-200">
          {(authDisabled || user) && (
            <button
              type="button"
              onClick={() => startNewGeneration(navigate)}
              className="rounded-md bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400"
            >
              New generation
            </button>
          )}
          {!authDisabled && user ? (
            <>
              <span>Signed in as {user.displayName}</span>
              <Link to="/account" className="rounded-md px-2 py-1 hover:bg-slate-800">
                Account
              </Link>
            </>
          ) : null}
          {!authDisabled && !user ? (
            <>
              <Link to="/sign-in" className="rounded-md px-2 py-1 hover:bg-slate-800">
                Sign in
              </Link>
              <Link to="/register" className="rounded-md bg-indigo-500 px-3 py-1.5 font-medium text-white hover:bg-indigo-400">
                Register
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
