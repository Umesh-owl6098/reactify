import { randomUUID } from "node:crypto";
import type {
  EditClarificationRequest,
  EditConfirmationRequest,
  EditIntentV1,
  EditOperationSummary,
  NaturalLanguageEditRequest,
  ProjectEditV1,
} from "@reactify/generation-contracts";
import { EditOperationSummarySchema } from "@reactify/generation-contracts";
import type { AIProvider, LoadPromptFn } from "@reactify/shared";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import type { Env } from "../../env.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { ALLOWED_DEPENDENCIES } from "../allowlist.js";
import { applyProjectPatch } from "../repair/patchApplicator.js";
import { validateProjectPatch } from "../repair/patchValidator.js";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import { normalizeProjectPath } from "../validation/filePathValidator.js";
import { validateEditEffectiveness, requiresConfirmation, validateSelectedScope } from "./editScopeValidator.js";
import { evaluateEditEligibility } from "./editEligibility.js";
import { validateEditInstruction } from "./instructionValidator.js";
import { parseEditIntentResponse, parseProjectEditResponse } from "./parseEditResponse.js";
import { projectEditToPatch } from "./projectEditToPatch.js";
import {
  computeIdempotencyFingerprint,
  createProjectVersion,
  ensureInitialVersion,
} from "./versionStore.js";

export interface InternalEditRecord extends EditOperationSummary {
  idempotencyFingerprint?: string;
  pendingEdit?: ProjectEditV1;
  pendingIntent?: EditIntentV1;
  selectedFiles?: string[];
  selectedComponentIds?: string[];
  clarificationAnswers: string[];
  clarificationRound: number;
  resolvedInstruction: string;
}

export interface EditServiceDeps {
  aiProvider: AIProvider;
  loadPrompt: LoadPromptFn;
  env: Env;
}

export type EditServiceResult =
  | { ok: true; summary: EditOperationSummary; duplicate: boolean }
  | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number };

function toSummary(record: InternalEditRecord): EditOperationSummary {
  return EditOperationSummarySchema.parse({
    editId: record.editId,
    generationId: record.generationId,
    status: record.status,
    instruction: record.instruction,
    intent: record.intent,
    sourceVersionId: record.sourceVersionId,
    createdVersionId: record.createdVersionId,
    projectHashBefore: record.projectHashBefore,
    projectHashAfter: record.projectHashAfter,
    changedFiles: record.changedFiles,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    failureReason: record.failureReason,
    clarificationQuestion: record.clarificationQuestion,
    confirmationRequired: record.confirmationRequired,
    versionNumber: record.versionNumber,
  });
}

function failEdit(edit: InternalEditRecord, message: string): void {
  edit.status = "failed";
  edit.failureReason = message;
  edit.completedAt = new Date().toISOString();
}

export class EditService {
  constructor(private readonly deps: EditServiceDeps) {}

  static fromDeps(deps: EditServiceDeps): EditService {
    return new EditService(deps);
  }

  listSummaries(record: GenerationRecord): EditOperationSummary[] {
    return record.edits.map((edit) => toSummary(edit));
  }

  getEdit(record: GenerationRecord, editId: string): InternalEditRecord | undefined {
    return record.edits.find((edit) => edit.editId === editId);
  }

  private verifyProjectHash(record: GenerationRecord, expectedProjectHash: string): EditServiceResult | null {
    if (!record.projectHash || record.projectHash !== expectedProjectHash) {
      return {
        ok: false,
        errorCode: ErrorCode.STALE_PROJECT_HASH,
        message: "Project hash is stale. Refresh and try again.",
        statusCode: 409,
      };
    }
    return null;
  }

  async createEdit(
    record: GenerationRecord,
    request: NaturalLanguageEditRequest,
    idempotencyKey?: string,
  ): Promise<EditServiceResult> {
    const eligibility = evaluateEditEligibility(record);
    if (!eligibility.ok) {
      return {
        ok: false,
        errorCode: eligibility.errorCode,
        message: eligibility.message,
        statusCode: eligibility.errorCode === ErrorCode.GENERATION_NOT_FOUND ? 404 : 409,
      };
    }

    const hashError = this.verifyProjectHash(record, request.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    ensureInitialVersion(record);
    const project = record.outputs.generatedProject!;

    const instructionResult = validateEditInstruction(request.instruction, {
      minLength: this.deps.env.MIN_EDIT_INSTRUCTION_LENGTH,
      maxLength: this.deps.env.MAX_EDIT_INSTRUCTION_LENGTH,
    });
    if (!instructionResult.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_EDIT_INSTRUCTION,
        message: instructionResult.message,
        statusCode: 422,
      };
    }

    const scopeResult = validateSelectedScope({
      project,
      selectedFiles: request.selectedFiles,
      selectedComponentIds: request.selectedComponentIds,
    });
    if (!scopeResult.ok) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_EDIT_INSTRUCTION,
        message: scopeResult.message,
        statusCode: 422,
      };
    }

    const fingerprint = computeIdempotencyFingerprint({
      generationId: record.id,
      versionId: record.activeVersionId!,
      instruction: instructionResult.normalized,
      selectedFiles: request.selectedFiles,
      selectedComponentIds: request.selectedComponentIds,
      idempotencyKey,
    });

    const existing = record.edits.find(
      (edit) =>
        edit.idempotencyFingerprint === fingerprint &&
        !["failed", "cancelled"].includes(edit.status),
    );
    if (existing) {
      return { ok: true, summary: toSummary(existing), duplicate: true };
    }

    record.editInProgress = true;
    const editId = randomUUID();
    const createdAt = new Date().toISOString();
    const edit: InternalEditRecord = {
      editId,
      generationId: record.id,
      status: "analyzing",
      instruction: instructionResult.normalized,
      resolvedInstruction: instructionResult.normalized,
      sourceVersionId: record.activeVersionId!,
      projectHashBefore: record.projectHash!,
      changedFiles: [],
      createdAt,
      clarificationAnswers: [],
      clarificationRound: 0,
      selectedFiles: request.selectedFiles,
      selectedComponentIds: request.selectedComponentIds,
      idempotencyFingerprint: fingerprint,
    };
    record.edits.push(edit);
    record.activeEditId = editId;
    record.updatedAt = createdAt;

    try {
      const intentResult = await this.runIntentAnalysis(record, edit, project);
      if (!intentResult.ok) {
        failEdit(edit, intentResult.message);
        return intentResult;
      }

      edit.intent = intentResult.intent;
      if (intentResult.intent.clarificationRequired) {
        edit.status = "clarification_required";
        edit.clarificationQuestion = intentResult.intent.clarificationQuestion ?? "Could you clarify your request?";
        return { ok: true, summary: toSummary(edit), duplicate: false };
      }

      return this.generateAndMaybeApply(record, edit, project, false);
    } catch {
      failEdit(edit, "Edit failed unexpectedly.");
      return {
        ok: false,
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: "Edit failed unexpectedly.",
        statusCode: 500,
      };
    } finally {
      record.editInProgress = false;
      record.updatedAt = new Date().toISOString();
    }
  }

  async submitClarification(
    record: GenerationRecord,
    editId: string,
    request: EditClarificationRequest,
  ): Promise<EditServiceResult> {
    const edit = this.getEdit(record, editId);
    if (!edit || edit.status !== "clarification_required") {
      return { ok: false, errorCode: ErrorCode.GENERATION_NOT_FOUND, message: "Edit not found.", statusCode: 404 };
    }

    const hashError = this.verifyProjectHash(record, request.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    if (edit.clarificationRound >= this.deps.env.MAX_EDIT_CLARIFICATION_ROUNDS) {
      failEdit(edit, "Maximum clarification rounds reached.");
      return { ok: false, errorCode: ErrorCode.EDIT_NOT_ALLOWED, message: "Maximum clarification rounds reached.", statusCode: 409 };
    }

    const answerResult = validateEditInstruction(request.answer, {
      minLength: 1,
      maxLength: this.deps.env.MAX_EDIT_INSTRUCTION_LENGTH,
    });
    if (!answerResult.ok) {
      return { ok: false, errorCode: ErrorCode.INVALID_EDIT_INSTRUCTION, message: answerResult.message, statusCode: 422 };
    }

    edit.clarificationRound += 1;
    edit.clarificationAnswers.push(answerResult.normalized);
    edit.resolvedInstruction = `${edit.instruction}\nClarification: ${answerResult.normalized}`;
    edit.status = "analyzing";
    record.editInProgress = true;

    const project = record.outputs.generatedProject!;
    try {
      const intentResult = await this.runIntentAnalysis(record, edit, project);
      if (!intentResult.ok) {
        failEdit(edit, intentResult.message);
        return intentResult;
      }

      edit.intent = intentResult.intent;
      if (intentResult.intent.clarificationRequired) {
        edit.status = "clarification_required";
        edit.clarificationQuestion = intentResult.intent.clarificationQuestion ?? "Could you clarify further?";
        return { ok: true, summary: toSummary(edit), duplicate: false };
      }

      return this.generateAndMaybeApply(record, edit, project, false);
    } finally {
      if (!["awaiting_confirmation", "clarification_required", "awaiting_sandbox_validation"].includes(edit.status)) {
        record.editInProgress = false;
      }
      record.updatedAt = new Date().toISOString();
    }
  }

  async confirmEdit(
    record: GenerationRecord,
    editId: string,
    request: EditConfirmationRequest,
  ): Promise<EditServiceResult> {
    const edit = this.getEdit(record, editId);
    if (!edit || edit.status !== "awaiting_confirmation" || !edit.pendingEdit || !edit.pendingIntent) {
      return { ok: false, errorCode: ErrorCode.GENERATION_NOT_FOUND, message: "Edit confirmation is not available.", statusCode: 404 };
    }

    const hashError = this.verifyProjectHash(record, request.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    record.editInProgress = true;
    try {
      return this.applyValidatedEdit(record, edit, edit.pendingEdit, edit.pendingIntent, edit.selectedFiles);
    } finally {
      record.editInProgress = false;
      record.updatedAt = new Date().toISOString();
    }
  }

  cancelEdit(record: GenerationRecord, editId: string): EditServiceResult {
    const edit = this.getEdit(record, editId);
    if (!edit) {
      return { ok: false, errorCode: ErrorCode.GENERATION_NOT_FOUND, message: "Edit not found.", statusCode: 404 };
    }

    const cancellable = new Set(["analyzing", "clarification_required", "generating_patch", "awaiting_confirmation"]);
    if (!cancellable.has(edit.status)) {
      return { ok: false, errorCode: ErrorCode.INVALID_GENERATION_STATE, message: "Edit cannot be cancelled in its current state.", statusCode: 409 };
    }

    edit.status = "cancelled";
    edit.completedAt = new Date().toISOString();
    record.editInProgress = false;
    record.activeEditId = null;
    record.updatedAt = edit.completedAt;
    return { ok: true, summary: toSummary(edit), duplicate: false };
  }

  async rollbackToVersion(
    record: GenerationRecord,
    versionId: string,
    expectedProjectHash: string,
  ): Promise<
    | { ok: true; versionId: string; versionNumber: number; projectHash: string }
    | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number }
  > {
    if (record.editInProgress || record.repairInProgress || record.exportInProgress) {
      return { ok: false, errorCode: ErrorCode.INVALID_GENERATION_STATE, message: "Rollback is unavailable while another mutation is running.", statusCode: 409 };
    }

    const hashError = this.verifyProjectHash(record, expectedProjectHash);
    if (hashError && !hashError.ok) {
      return hashError;
    }

    const target = record.versions.find((version) => version.versionId === versionId);
    if (!target) {
      return { ok: false, errorCode: ErrorCode.GENERATION_NOT_FOUND, message: "Version not found.", statusCode: 404 };
    }

    if (target.versionId === record.activeVersionId) {
      return { ok: false, errorCode: ErrorCode.INVALID_GENERATION_STATE, message: "Version is already active.", statusCode: 409 };
    }

    record.rollbackInProgress = true;
    try {
      const version = createProjectVersion({
        record,
        project: target.project,
        source: "rollback",
        label: `Rollback to v${target.versionNumber}`,
        parentVersionId: record.activeVersionId,
        changedFiles: target.project.files.map((file) => file.path),
      });

      record.outputs.generatedProject = structuredClone(version.project);
      record.projectHash = version.projectHash;
      record.sandboxValidation = null;
      record.validationReportFingerprint = null;
      record.awaitingSandboxValidation = true;
      record.status = "Compiling";
      record.activeStage = "sandbox_compilation";
      record.updatedAt = new Date().toISOString();

      return {
        ok: true,
        versionId: version.versionId,
        versionNumber: version.versionNumber,
        projectHash: version.projectHash,
      };
    } finally {
      record.rollbackInProgress = false;
    }
  }

  private async runIntentAnalysis(
    record: GenerationRecord,
    edit: InternalEditRecord,
    project: NonNullable<GenerationRecord["outputs"]["generatedProject"]>,
  ): Promise<
    | { ok: true; intent: EditIntentV1 }
    | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number }
  > {
    try {
      const prompt = this.deps.loadPrompt("edit-intent-analysis");
      const invocation = await this.deps.aiProvider.invoke(
        [
          { text: prompt.content },
          { text: `User instruction:\n${edit.resolvedInstruction}` },
          { text: `Project summary:\n${project.summary}` },
          { text: `Components:\n${JSON.stringify(project.components)}` },
          { text: `Files:\n${JSON.stringify(project.files.map((file) => ({ path: file.path, language: file.language, purpose: file.purpose })))}` },
          { text: `Selected files:\n${JSON.stringify(edit.selectedFiles ?? [])}` },
          { text: `Selected components:\n${JSON.stringify(edit.selectedComponentIds ?? [])}` },
        ],
        {
          promptVersion: prompt.meta.promptVersion,
          model: this.deps.env.ANTHROPIC_MODEL,
          temperature: this.deps.env.AI_TEMPERATURE,
          maxTokens: this.deps.env.AI_MAX_TOKENS,
          timeoutMs: this.deps.env.AI_TIMEOUT_MS,
        },
      );

      const parsed = parseEditIntentResponse(invocation.rawText);
      if (!parsed.ok) {
        return { ok: false, errorCode: parsed.errorCode, message: parsed.message, statusCode: 422 };
      }

      return { ok: true, intent: parsed.intent };
    } catch (error) {
      if (error instanceof AIProviderError) {
        return { ok: false, errorCode: error.errorCode, message: error.message, statusCode: error.errorCode === ErrorCode.AI_TIMEOUT ? 504 : 502 };
      }
      return { ok: false, errorCode: ErrorCode.AI_ERROR, message: "Intent analysis failed.", statusCode: 502 };
    }
  }

  private async generateProjectEdit(
    record: GenerationRecord,
    edit: InternalEditRecord,
    project: NonNullable<GenerationRecord["outputs"]["generatedProject"]>,
    intent: EditIntentV1,
  ): Promise<
    | { ok: true; edit: ProjectEditV1 }
    | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number }
  > {
    try {
      const prompt = this.deps.loadPrompt("project-edit");
      const allowlist = JSON.stringify([...ALLOWED_DEPENDENCIES].sort());
      const invocation = await this.deps.aiProvider.invoke(
        [
          { text: prompt.content },
          { text: `Approved dependency allowlist:\n${allowlist}` },
          { text: `Validated instruction:\n${edit.resolvedInstruction}` },
          { text: `EditIntentV1:\n${JSON.stringify(intent)}` },
          { text: `Active GeneratedProjectV1:\n${JSON.stringify(project)}` },
          { text: `Selected files:\n${JSON.stringify(edit.selectedFiles ?? [])}` },
          { text: `Selected components:\n${JSON.stringify(edit.selectedComponentIds ?? [])}` },
        ],
        {
          promptVersion: prompt.meta.promptVersion,
          model: this.deps.env.ANTHROPIC_MODEL,
          temperature: this.deps.env.AI_TEMPERATURE,
          maxTokens: this.deps.env.AI_MAX_TOKENS,
          timeoutMs: this.deps.env.AI_TIMEOUT_MS,
        },
      );

      const parsed = parseProjectEditResponse(invocation.rawText);
      if (!parsed.ok) {
        return { ok: false, errorCode: parsed.errorCode, message: parsed.message, statusCode: 422 };
      }

      return { ok: true, edit: parsed.edit };
    } catch (error) {
      if (error instanceof AIProviderError) {
        return { ok: false, errorCode: error.errorCode, message: error.message, statusCode: error.errorCode === ErrorCode.AI_TIMEOUT ? 504 : 502 };
      }
      return { ok: false, errorCode: ErrorCode.AI_ERROR, message: "Project edit generation failed.", statusCode: 502 };
    }
  }

  private async generateAndMaybeApply(
    record: GenerationRecord,
    edit: InternalEditRecord,
    project: NonNullable<GenerationRecord["outputs"]["generatedProject"]>,
    skipConfirmation: boolean,
  ): Promise<EditServiceResult> {
    edit.status = "generating_patch";
    const generated = await this.generateProjectEdit(record, edit, project, edit.intent!);
    if (!generated.ok) {
      failEdit(edit, generated.message);
      return generated;
    }

    edit.status = "validating_patch";
    const patch = projectEditToPatch(generated.edit);
    const patchValidation = validateProjectPatch(patch, {
      maxFileBytes: this.deps.env.MAX_PATCH_FILE_BYTES,
      maxTotalBytes: this.deps.env.MAX_PATCH_TOTAL_BYTES,
    });

    if (!patchValidation.ok) {
      const errorCode =
        patchValidation.errorCode === ErrorCode.PATCH_SECURITY_VIOLATION
          ? ErrorCode.EDIT_SECURITY_VIOLATION
          : patchValidation.errorCode === ErrorCode.PATCH_PATH_INVALID
            ? ErrorCode.EDIT_PATH_INVALID
            : patchValidation.errorCode === ErrorCode.PATCH_DEPENDENCY_INVALID
              ? ErrorCode.EDIT_DEPENDENCY_INVALID
              : ErrorCode.EDIT_SCHEMA_INVALID;
      failEdit(edit, patchValidation.message);
      return { ok: false, errorCode, message: patchValidation.message, statusCode: 409 };
    }

    if (!skipConfirmation && requiresConfirmation(edit.intent!, generated.edit, {
      highRiskFileThreshold: this.deps.env.HIGH_RISK_FILE_THRESHOLD,
      maxScopeRatio: this.deps.env.MAX_EDIT_SCOPE_RATIO,
    })) {
      edit.pendingEdit = generated.edit;
      edit.pendingIntent = edit.intent;
      edit.status = "awaiting_confirmation";
      edit.confirmationRequired = true;
      edit.changedFiles = [
        ...generated.edit.changedFiles.map((file) => normalizeProjectPath(file.path)),
        ...generated.edit.deletedFiles.map((path) => normalizeProjectPath(path)),
      ];
      record.editInProgress = true;
      return { ok: true, summary: toSummary(edit), duplicate: false };
    }

    return this.applyValidatedEdit(record, edit, generated.edit, edit.intent!, edit.selectedFiles);
  }

  private applyValidatedEdit(
    record: GenerationRecord,
    edit: InternalEditRecord,
    projectEdit: ProjectEditV1,
    intent: EditIntentV1,
    selectedFiles?: string[],
  ): EditServiceResult {
    edit.status = "applying_patch";
    const project = record.outputs.generatedProject!;
    const patch = projectEditToPatch(projectEdit);
    const patchValidation = validateProjectPatch(patch, {
      maxFileBytes: this.deps.env.MAX_PATCH_FILE_BYTES,
      maxTotalBytes: this.deps.env.MAX_PATCH_TOTAL_BYTES,
    });

    if (!patchValidation.ok) {
      failEdit(edit, patchValidation.message);
      return {
        ok: false,
        errorCode: ErrorCode.EDIT_APPLY_FAILED,
        message: patchValidation.message,
        statusCode: 409,
      };
    }

    const applied = applyProjectPatch(project, patchValidation.patch);
    if (!applied.ok) {
      failEdit(edit, applied.message);
      return { ok: false, errorCode: ErrorCode.EDIT_APPLY_FAILED, message: applied.message, statusCode: 409 };
    }

    const effectiveness = validateEditEffectiveness({
      project,
      edit: projectEdit,
      projectHashBefore: edit.projectHashBefore,
      projectHashAfter: applied.result.projectHash,
      selectedFiles,
      intent,
      limits: {
        highRiskFileThreshold: this.deps.env.HIGH_RISK_FILE_THRESHOLD,
        maxScopeRatio: this.deps.env.MAX_EDIT_SCOPE_RATIO,
      },
    });

    if (!effectiveness.ok) {
      failEdit(edit, effectiveness.message);
      return { ok: false, errorCode: effectiveness.errorCode, message: effectiveness.message, statusCode: 409 };
    }

    const changedFiles = [
      ...applied.result.changedPaths,
      ...applied.result.deletedPaths,
    ];

    const version = createProjectVersion({
      record,
      project: applied.result.project,
      source: "natural_language_edit",
      label: projectEdit.editSummary,
      parentVersionId: edit.sourceVersionId,
      changedFiles,
      editId: edit.editId,
      instruction: edit.instruction,
    });

    record.outputs.generatedProject = applied.result.project;
    record.projectHash = applied.result.projectHash;
    record.schemaValidation = { valid: true, errors: [] };
    record.staticValidation = applied.result.staticValidation;
    record.sandboxValidation = null;
    record.validationReportFingerprint = null;
    record.awaitingSandboxValidation = true;
    record.status = "Compiling";
    record.activeStage = "sandbox_compilation";
    record.editedByUser = true;

    edit.status = "awaiting_sandbox_validation";
    edit.createdVersionId = version.versionId;
    edit.projectHashAfter = version.projectHash;
    edit.changedFiles = changedFiles;
    edit.versionNumber = version.versionNumber;
    edit.pendingEdit = undefined;
    edit.pendingIntent = undefined;
    edit.confirmationRequired = false;
    record.editInProgress = false;
    record.activeEditId = edit.editId;

    return { ok: true, summary: toSummary(edit), duplicate: false };
  }
}

export function completeEditAfterValidation(record: GenerationRecord, success: boolean): void {
  const edit = record.edits.find((entry) => entry.editId === record.activeEditId);
  if (!edit || edit.status !== "awaiting_sandbox_validation") {
    return;
  }

  edit.completedAt = new Date().toISOString();
  if (success) {
    edit.status = "completed";
    record.activeEditId = null;
  } else {
    edit.status = "failed";
    edit.failureReason = "Sandbox revalidation failed after edit.";
    record.activeEditId = null;
  }
}

export function buildLatestEditSummary(record: GenerationRecord): EditOperationSummary | null {
  const latest = record.edits.at(-1);
  return latest ? toSummary(latest) : null;
}

export function getActiveEditClarification(record: GenerationRecord): {
  clarificationRequired: boolean;
  clarificationQuestion: string | null;
} {
  const active = record.edits.find((edit) => edit.editId === record.activeEditId);
  if (!active || active.status !== "clarification_required") {
    return { clarificationRequired: false, clarificationQuestion: null };
  }
  return {
    clarificationRequired: true,
    clarificationQuestion: active.clarificationQuestion ?? null,
  };
}
