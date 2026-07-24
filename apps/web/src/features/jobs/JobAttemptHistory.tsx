interface JobAttemptHistoryProps {
  attempts: Array<{
    attemptNumber: number;
    status: string;
    failureMessage?: string | null;
  }>;
}

export function JobAttemptHistory({ attempts }: JobAttemptHistoryProps) {
  if (attempts.length === 0) {
    return null;
  }

  return (
    <ul className="mt-3 space-y-1 text-xs text-slate-400">
      {attempts.map((attempt) => (
        <li key={attempt.attemptNumber}>
          Attempt {attempt.attemptNumber}: {attempt.status}
          {attempt.failureMessage ? ` — ${attempt.failureMessage}` : ""}
        </li>
      ))}
    </ul>
  );
}
