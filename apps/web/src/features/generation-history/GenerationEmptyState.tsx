interface GenerationEmptyStateProps {
  message?: string;
}

export function GenerationEmptyState({
  message = "No generations yet. Upload a screenshot to create your first project.",
}: GenerationEmptyStateProps) {
  return (
    <div
      className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-10 text-center"
      role="status"
      aria-label="Empty generation history"
    >
      <p className="text-slate-300">{message}</p>
    </div>
  );
}
