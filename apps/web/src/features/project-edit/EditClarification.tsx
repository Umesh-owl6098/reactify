interface EditClarificationProps {
  question: string;
  onSubmit: (answer: string) => void;
  disabled?: boolean;
}

export function EditClarification({ question, onSubmit, disabled }: EditClarificationProps) {
  return (
    <form
      className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4"
      aria-live="polite"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const answer = new FormData(form).get("answer");
        if (typeof answer === "string" && answer.trim()) {
          onSubmit(answer.trim());
          form.reset();
        }
      }}
    >
      <p className="text-sm text-amber-100">{question}</p>
      <label className="mt-3 block text-sm text-slate-200">
        Your clarification
        <input
          name="answer"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          disabled={disabled}
          aria-label="Clarification answer"
        />
      </label>
      <button
        type="submit"
        className="mt-3 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={disabled}
      >
        Submit clarification
      </button>
    </form>
  );
}
