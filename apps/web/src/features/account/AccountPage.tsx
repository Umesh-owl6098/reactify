import { AppHeader } from "../layout/AppHeader";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { ProfileForm } from "./ProfileForm";
import { SessionList } from "./SessionList";
import { useSignOut } from "../auth/useSession";

export function AccountPage() {
  const signOut = useSignOut();

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
          <div>
            <h1 className="text-3xl font-bold">Account</h1>
            <p className="mt-2 text-slate-300">Manage your profile, password, active sessions, and AI usage.</p>
          </div>

          <nav aria-label="Account sections" className="flex flex-wrap gap-2">
            <a href="/account" className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
              Profile
            </a>
            <a href="/account" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900">
              Sessions
            </a>
            <a href="/account/usage" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-900">
              Usage
            </a>
          </nav>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-4 text-xl font-semibold">Profile</h2>
            <ProfileForm />
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-4 text-xl font-semibold">Password</h2>
            <ChangePasswordForm />
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="mb-4 text-xl font-semibold">Active sessions</h2>
            <SessionList />
          </section>

          <section>
            <button type="button" onClick={() => void signOut()} className="rounded-lg border border-slate-700 px-4 py-2 hover:bg-slate-900">
              Sign out of this browser
            </button>
          </section>
        </main>
      </div>
    </ProtectedRoute>
  );
}
