import { useState } from "react";
import { AuthApiError, changePassword } from "../auth/authApi";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated. Other active sessions were revoked.");
    } catch (submitError) {
      setError(submitError instanceof AuthApiError ? submitError.message : "Password change failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
      <div>
        <label htmlFor="current-password" className="mb-1 block text-sm font-medium text-slate-200">
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </div>
      <div>
        <label htmlFor="new-password" className="mb-1 block text-sm font-medium text-slate-200">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </div>
      <div>
        <label htmlFor="confirm-new-password" className="mb-1 block text-sm font-medium text-slate-200">
          Confirm new password
        </label>
        <input
          id="confirm-new-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50"
        />
      </div>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      <button type="submit" disabled={isSubmitting} className="rounded-lg bg-indigo-500 px-4 py-2 text-white hover:bg-indigo-400 disabled:opacity-60">
        Change password
      </button>
    </form>
  );
}
