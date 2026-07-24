import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";

interface AuthFormProps {
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  children: ReactNode;
  errorMessage?: string | null;
  successMessage?: string | null;
  isSubmitting?: boolean;
}

export function AuthForm({ submitLabel, onSubmit, children, errorMessage, successMessage, isSubmitting = false }: AuthFormProps) {
  const errorId = useId();
  const statusId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [announcement, setAnnouncement] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAnnouncement("");
    await onSubmit(event);
    if (errorMessage) {
      setAnnouncement(errorMessage);
      const firstInvalid = formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']");
      firstInvalid?.focus();
    }
  }

  return (
    <form ref={formRef} onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-4">
      {children}

      {errorMessage ? (
        <p id={errorId} role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{successMessage}</p>
      ) : null}

      <p aria-live="polite" className="sr-only" id={statusId}>
        {announcement || (isSubmitting ? "Submitting form" : "")}
      </p>

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="w-full rounded-lg bg-indigo-500 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}

export function AuthField({
  id,
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  required = true,
  describedBy,
  invalid = false,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-200">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-50 outline-none ring-indigo-400 focus:ring-2"
      />
    </div>
  );
}

export function AuthHelpText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-sm text-slate-400">
      {children}
    </p>
  );
}
