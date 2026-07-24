import type { GenerationStatusResponse } from "@reactify/generation-contracts";
import { EditClarification } from "./EditClarification";
import { EditHistory } from "./EditHistory";
import { EditInstructionInput } from "./EditInstructionInput";
import { EditProgress } from "./EditProgress";
import { EditScopeSelector } from "./EditScopeSelector";
import { useProjectEdit } from "./useProjectEdit";

interface ProjectEditPanelProps {
  status: GenerationStatusResponse;
  onRefreshStatus: () => void;
}

export function ProjectEditPanel({ status, onRefreshStatus }: ProjectEditPanelProps) {
  const project = status.outputs.generatedProject;
  const editState = useProjectEdit(status, onRefreshStatus);

  if (!project) {
    return null;
  }

  return (
    <section className="space-y-4" aria-labelledby="project-edit-heading">
      <div>
        <h3 id="project-edit-heading" className="text-sm font-semibold text-white">
          Edit with AI
        </h3>
        <p className="mt-1 text-sm text-slate-300">
          Describe a change in natural language. Reactify will create a new immutable version and revalidate it in Sandpack.
        </p>
        {!editState.editAllowed && editState.editBlockedReason ? (
          <p className="mt-2 text-sm text-amber-200" role="status">
            Editing unavailable: {editState.editBlockedReason.replaceAll("_", " ")}.
          </p>
        ) : null}
      </div>

      <EditInstructionInput
        value={editState.instruction}
        onChange={editState.setInstruction}
        disabled={!editState.editAllowed || editState.isSubmitting}
      />

      <EditScopeSelector
        project={project}
        selectedFiles={editState.selectedFiles}
        selectedComponentIds={editState.selectedComponentIds}
        onToggleFile={editState.toggleFile}
        onToggleComponent={editState.toggleComponent}
      />

      {editState.phase === "clarifying" && editState.clarificationQuestion ? (
        <EditClarification
          question={editState.clarificationQuestion}
          disabled={editState.isSubmitting}
          onSubmit={(answer) => void editState.submitClarification(answer)}
        />
      ) : null}

      {editState.phase === "confirming" && editState.activeEdit?.intent ? (
        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-50" role="dialog" aria-label="Confirm high-risk edit">
          <p className="font-medium">High-risk edit confirmation required</p>
          <p className="mt-2">{editState.activeEdit.intent.summary}</p>
          <p className="mt-2">Likely files: {editState.activeEdit.changedFiles.join(", ") || "See generated patch"}</p>
          <button
            type="button"
            className="mt-3 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={editState.isSubmitting}
            onClick={() => void editState.confirmEdit()}
          >
            Confirm and apply edit
          </button>
        </div>
      ) : null}

      <EditProgress phase={editState.phase} error={editState.error} />

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!editState.editAllowed || editState.isSubmitting || !editState.instruction.trim()}
          aria-label="Submit AI edit"
          onClick={() => void editState.submitEdit()}
        >
          Apply edit
        </button>
        {editState.activeVersionNumber ? (
          <p className="self-center text-sm text-slate-400">Active version v{editState.activeVersionNumber}</p>
        ) : null}
      </div>

      <EditHistory history={editState.history} />
    </section>
  );
}
