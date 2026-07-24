export function BudgetWarning({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-amber-700/60 bg-amber-950/40 p-3 text-amber-100">
      {message}
    </div>
  );
}

export function BudgetBlocked({ reason, nextResetAt }: { reason: string; nextResetAt?: string }) {
  return (
    <div role="alert" aria-live="assertive" className="rounded-lg border border-rose-700/60 bg-rose-950/40 p-3 text-rose-100">
      <p>{reason}</p>
      {nextResetAt ? <p className="mt-2 text-sm">Limits reset on {new Date(nextResetAt).toLocaleString()}.</p> : null}
    </div>
  );
}
