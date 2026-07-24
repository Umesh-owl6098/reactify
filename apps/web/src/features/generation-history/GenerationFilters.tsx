const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "Ready", label: "Ready" },
  { value: "Planning", label: "Planning" },
  { value: "Compiling", label: "Compiling" },
  { value: "Repairing", label: "Repairing" },
  { value: "Failed", label: "Failed" },
  { value: "Cancelled", label: "Cancelled" },
];

interface GenerationFiltersProps {
  statusFilter: string;
  onStatusChange: (status: string) => void;
}

export function GenerationFilters({ statusFilter, onStatusChange }: GenerationFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor="generation-status-filter" className="text-sm text-slate-300">
        Filter by status
      </label>
      <select
        id="generation-status-filter"
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
        className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
        aria-label="Filter generations by status"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
