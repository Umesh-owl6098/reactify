interface EditInstructionInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function EditInstructionInput({ value, onChange, disabled }: EditInstructionInputProps) {
  return (
    <label className="block text-sm text-slate-200">
      Edit instruction
      <textarea
        className="mt-1 min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
        value={value}
        disabled={disabled}
        aria-label="Edit instruction"
        placeholder="Describe the change you want, such as “Make the primary button dark blue.”"
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-xs text-slate-400">
        Reactify will analyze the active project, generate a safe patch, and revalidate it in Sandpack.
      </span>
    </label>
  );
}
