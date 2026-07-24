import type { ReactNode } from "react";
import { useState } from "react";
import type { GenerationPlanV1, GenerationStatusResponse } from "@reactify/generation-contracts";
import { cancelGeneration, confirmGenerationPlan } from "../../lib/generation-api";
import { usePlanEditor } from "./usePlanEditor";

interface GenerationPlanReviewProps {
  status: GenerationStatusResponse;
  onConfirmed: () => void;
  onCancelled: () => void;
}

export function GenerationPlanReview({ status, onConfirmed, onCancelled }: GenerationPlanReviewProps) {
  const originalPlan = status.outputs.generationPlan;
  const editingEnabled = status.featureFlags.enableGenerationPlanEditing;
  const { draftPlan, validation, hasUnsavedChanges, updateDraft, resetDraft } = usePlanEditor(
    originalPlan,
    editingEnabled,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!draftPlan || !originalPlan) {
    return null;
  }

  const handleConfirm = async () => {
    if (!validation.success || !draftPlan || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      await confirmGenerationPlan(status.id, draftPlan);
      onConfirmed();
    } catch {
      setActionError("Unable to confirm the generation plan. Try again.");
      setIsSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      await cancelGeneration(status.id);
      onCancelled();
    } catch {
      setActionError("Unable to cancel the generation.");
      setIsSubmitting(false);
    }
  };

  return (
    <section
      className="space-y-6 rounded-2xl border border-indigo-400/30 bg-indigo-500/5 p-5 text-left"
      aria-labelledby="generation-plan-review-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="generation-plan-review-heading" className="text-lg font-semibold text-white">
            Review generation plan
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Confirm the planned components and files before mocked code generation continues.
          </p>
        </div>
        {hasUnsavedChanges ? (
          <p className="rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-100">
            Unsaved changes
          </p>
        ) : null}
      </div>

      <PlanSummary plan={draftPlan} metadata={status.plan} />

      <ComponentsSection
        plan={draftPlan}
        editingEnabled={editingEnabled}
        fieldErrors={validation.fieldErrors}
        onUpdate={updateDraft}
      />

      <FilesSection plan={draftPlan} editingEnabled={editingEnabled} onUpdate={updateDraft} />

      <DesignTokensSection plan={draftPlan} editingEnabled={editingEnabled} onUpdate={updateDraft} />

      <StrategiesSection
        plan={draftPlan}
        editingEnabled={editingEnabled}
        onUpdate={updateDraft}
      />

      <WarningsSection plan={draftPlan} editingEnabled={editingEnabled} onUpdate={updateDraft} />

      {!validation.success ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          <p className="font-medium">Fix validation errors before confirming.</p>
          <ul className="mt-2 list-disc pl-5">
            {Object.entries(validation.fieldErrors).map(([field, message]) => (
              <li key={field}>
                {field}: {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionError ? (
        <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => void handleConfirm()}
          disabled={!validation.success || isSubmitting}
          aria-label="Confirm generation plan"
        >
          {isSubmitting ? "Confirming..." : "Confirm Plan"}
        </button>
        {editingEnabled ? (
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100"
            onClick={resetDraft}
            disabled={!hasUnsavedChanges || isSubmitting}
          >
            Reset Changes
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-lg border border-red-400/40 px-4 py-2 text-sm font-medium text-red-100"
          onClick={() => void handleCancel()}
          disabled={isSubmitting}
          aria-label="Cancel generation"
        >
          Cancel Generation
        </button>
      </div>
    </section>
  );
}

function PlanSummary({
  plan,
  metadata,
}: {
  plan: GenerationPlanV1;
  metadata: GenerationStatusResponse["plan"];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <SummaryCard label="Components" value={String(plan.components.length)} />
      <SummaryCard label="Files" value={String(plan.files.length)} />
      <SummaryCard label="Dependencies" value={String(Object.keys(plan.dependencies).length)} />
      <SummaryCard label="Warnings" value={String(plan.confidenceWarnings.length)} />
      {metadata ? (
        <div className="sm:col-span-2 lg:col-span-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
          Provider {metadata.provider} · {metadata.model} · {metadata.inputTokens} in / {metadata.outputTokens} out ·{" "}
          {metadata.latencyMs} ms
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function ComponentsSection({
  plan,
  editingEnabled,
  fieldErrors,
  onUpdate,
}: {
  plan: GenerationPlanV1;
  editingEnabled: boolean;
  fieldErrors: Record<string, string>;
  onUpdate: (updater: (current: GenerationPlanV1) => GenerationPlanV1) => void;
}) {
  return (
    <section aria-labelledby="plan-components-heading">
      <h3 id="plan-components-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Components
      </h3>
      <ul className="mt-3 space-y-3">
        {plan.components.map((component, index) => (
          <li key={component.name} className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-white">{component.name}</p>
              <span className="text-xs text-slate-400">{component.type}</span>
            </div>
            {editingEnabled ? (
              <label className="mt-3 block text-sm text-slate-300">
                Purpose
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                  value={component.purpose}
                  onChange={(event) =>
                    onUpdate((current) => ({
                      ...current,
                      components: current.components.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, purpose: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
            ) : (
              <p className="mt-2 text-sm text-slate-300">{component.purpose}</p>
            )}
            <p className="mt-2 text-xs text-slate-400">
              Props: {component.props.length} · Children: {component.children ? "yes" : "no"} · Depends on:{" "}
              {component.dependencies.join(", ") || "none"}
            </p>
            {editingEnabled ? (
              <label className="mt-3 block text-sm text-slate-300">
                Accessibility notes
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                  value={component.accessibilityNotes}
                  onChange={(event) =>
                    onUpdate((current) => ({
                      ...current,
                      components: current.components.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, accessibilityNotes: event.target.value }
                          : item,
                      ),
                    }))
                  }
                />
              </label>
            ) : (
              <p className="mt-2 text-sm text-slate-300">{component.accessibilityNotes}</p>
            )}
            {fieldErrors[`components.${index}.purpose`] ? (
              <p className="mt-2 text-xs text-red-300">{fieldErrors[`components.${index}.purpose`]}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilesSection({
  plan,
  editingEnabled,
  onUpdate,
}: {
  plan: GenerationPlanV1;
  editingEnabled: boolean;
  onUpdate: (updater: (current: GenerationPlanV1) => GenerationPlanV1) => void;
}) {
  return (
    <section aria-labelledby="plan-files-heading">
      <h3 id="plan-files-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Files
      </h3>
      <ul className="mt-3 space-y-3">
        {plan.files.map((file, index) => (
          <li key={file.path} className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
            <p className="font-medium text-white">{file.path}</p>
            <p className="mt-1 text-xs text-slate-400">
              {file.language} · {file.components.join(", ")}
            </p>
            {editingEnabled ? (
              <label className="mt-3 block text-sm text-slate-300">
                Purpose
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
                  value={file.purpose}
                  onChange={(event) =>
                    onUpdate((current) => ({
                      ...current,
                      files: current.files.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, purpose: event.target.value } : item,
                      ),
                    }))
                  }
                />
              </label>
            ) : (
              <p className="mt-2 text-sm text-slate-300">{file.purpose}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DesignTokensSection({
  plan,
  editingEnabled,
  onUpdate,
}: {
  plan: GenerationPlanV1;
  editingEnabled: boolean;
  onUpdate: (updater: (current: GenerationPlanV1) => GenerationPlanV1) => void;
}) {
  return (
    <section aria-labelledby="plan-tokens-heading">
      <h3 id="plan-tokens-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Design tokens
      </h3>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <TokenGroup
          title="Colors"
          tokens={plan.designTokens.colors}
          editingEnabled={editingEnabled}
          onChange={(colors) =>
            onUpdate((current) => ({
              ...current,
              designTokens: { ...current.designTokens, colors },
            }))
          }
          renderValue={(value) => (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-5 w-5 rounded border border-white/10"
                style={{ backgroundColor: value }}
                aria-hidden="true"
              />
              {value}
            </span>
          )}
        />
        <TokenGroup
          title="Typography"
          tokens={plan.designTokens.typography}
          editingEnabled={editingEnabled}
          onChange={(typography) =>
            onUpdate((current) => ({
              ...current,
              designTokens: { ...current.designTokens, typography },
            }))
          }
        />
        <TokenGroup
          title="Spacing"
          tokens={plan.designTokens.spacing}
          editingEnabled={editingEnabled}
          onChange={(spacing) =>
            onUpdate((current) => ({
              ...current,
              designTokens: { ...current.designTokens, spacing },
            }))
          }
        />
        {plan.designTokens.borderRadius ? (
          <TokenGroup
            title="Border radius"
            tokens={plan.designTokens.borderRadius}
            editingEnabled={editingEnabled}
            onChange={(borderRadius) =>
              onUpdate((current) => ({
                ...current,
                designTokens: { ...current.designTokens, borderRadius },
              }))
            }
          />
        ) : null}
        {plan.designTokens.shadows ? (
          <TokenGroup
            title="Shadows"
            tokens={plan.designTokens.shadows}
            editingEnabled={editingEnabled}
            onChange={(shadows) =>
              onUpdate((current) => ({
                ...current,
                designTokens: { ...current.designTokens, shadows },
              }))
            }
          />
        ) : null}
      </div>
    </section>
  );
}

function TokenGroup({
  title,
  tokens,
  editingEnabled,
  onChange,
  renderValue,
}: {
  title: string;
  tokens: Record<string, string>;
  editingEnabled: boolean;
  onChange: (tokens: Record<string, string>) => void;
  renderValue?: (value: string) => ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-4">
      <h4 className="text-sm font-medium text-white">{title}</h4>
      <ul className="mt-3 space-y-2">
        {Object.entries(tokens).map(([name, value]) => (
          <li key={name} className="text-sm text-slate-300">
            <span className="font-medium text-slate-100">{name}: </span>
            {editingEnabled ? (
              <input
                className="ml-2 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                value={value}
                aria-label={`${title} token ${name}`}
                onChange={(event) =>
                  onChange({
                    ...tokens,
                    [name]: event.target.value,
                  })
                }
              />
            ) : renderValue ? (
              renderValue(value)
            ) : (
              value
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function StrategiesSection({
  plan,
  editingEnabled,
  onUpdate,
}: {
  plan: GenerationPlanV1;
  editingEnabled: boolean;
  onUpdate: (updater: (current: GenerationPlanV1) => GenerationPlanV1) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <StrategyField
        label="Responsive strategy"
        value={plan.responsiveStrategy}
        editingEnabled={editingEnabled}
        onChange={(responsiveStrategy) => onUpdate((current) => ({ ...current, responsiveStrategy }))}
      />
      <StrategyField
        label="Accessibility strategy"
        value={plan.accessibilityStrategy}
        editingEnabled={editingEnabled}
        onChange={(accessibilityStrategy) => onUpdate((current) => ({ ...current, accessibilityStrategy }))}
      />
    </section>
  );
}

function StrategyField({
  label,
  value,
  editingEnabled,
  onChange,
}: {
  label: string;
  value: string;
  editingEnabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-lg border border-slate-700 bg-slate-950/60 p-4 text-sm text-slate-300">
      {label}
      {editingEnabled ? (
        <textarea
          className="mt-2 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <p className="mt-2 text-slate-200">{value}</p>
      )}
    </label>
  );
}

function WarningsSection({
  plan,
  editingEnabled,
  onUpdate,
}: {
  plan: GenerationPlanV1;
  editingEnabled: boolean;
  onUpdate: (updater: (current: GenerationPlanV1) => GenerationPlanV1) => void;
}) {
  return (
    <section aria-labelledby="plan-warnings-heading">
      <h3 id="plan-warnings-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Confidence warnings
      </h3>
      <ul className="mt-3 space-y-2">
        {plan.confidenceWarnings.map((warning, index) => (
          <li key={`${warning}-${index}`}>
            {editingEnabled ? (
              <input
                className="w-full rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                value={warning}
                aria-label={`Confidence warning ${index + 1}`}
                onChange={(event) =>
                  onUpdate((current) => ({
                    ...current,
                    confidenceWarnings: current.confidenceWarnings.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  }))
                }
              />
            ) : (
              <p className="rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {warning}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
