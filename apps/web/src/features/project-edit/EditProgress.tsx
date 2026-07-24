import type { EditPhase } from "./projectEditStore";

interface EditProgressProps {
  phase: EditPhase;
  error: string | null;
}

const LABELS: Record<EditPhase, string> = {
  idle: "Ready to edit.",
  submitting: "Analyzing instruction and generating patch…",
  clarifying: "Waiting for clarification.",
  confirming: "Review the proposed high-risk edit before applying.",
  awaiting_validation: "Edit applied. Waiting for Sandpack revalidation…",
  completed: "Edit completed successfully.",
  failed: "Edit failed.",
};

export function EditProgress({ phase, error }: EditProgressProps) {
  if (phase === "idle" && !error) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-4 rounded-lg px-4 py-3 text-sm ${
        phase === "failed"
          ? "border border-rose-400/30 bg-rose-500/10 text-rose-100"
          : "border border-indigo-400/30 bg-indigo-500/10 text-indigo-100"
      }`}
    >
      <p>{error ?? LABELS[phase]}</p>
    </div>
  );
}
