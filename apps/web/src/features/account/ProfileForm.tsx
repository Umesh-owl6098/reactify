import { useState } from "react";
import { AuthApiError, updateProfile } from "../auth/authApi";
import { useAuthStore } from "../auth/authStore";

export function ProfileForm() {
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setIsSubmitting(true);
    try {
      const updated = await updateProfile({ displayName });
      setUser(updated);
      setMessage("Profile updated.");
    } catch (submitError) {
      setError(submitError instanceof AuthApiError ? submitError.message : "Profile update failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div>
        <label htmlFor="account-email" className="mb-1 block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          id="account-email"
          value={user?.email ?? ""}
          readOnly
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-400"
        />
      </div>
      <div>
        <label htmlFor="account-display-name" className="mb-1 block text-sm font-medium text-slate-200">
          Display name
        </label>
        <input
          id="account-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </div>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      <button type="submit" disabled={isSubmitting} className="rounded-lg bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-400 disabled:opacity-60">
        Save profile
      </button>
    </form>
  );
}
