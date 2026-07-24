import type { StageExecutor, StageResult } from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
import { computeProjectHash } from "../../lib/projectHash.js";
import { applyProjectPatch } from "../../lib/repair/patchApplicator.js";
import { parseProjectPatchResponse } from "../../lib/repair/parseProjectPatch.js";
import { validateProjectPatch } from "../../lib/repair/patchValidator.js";
import {
  classifyRepairability,
  collectRepairDiagnostics,
  diagnosticsFingerprint,
  patchFingerprint,
} from "../../lib/repair/repairabilityClassifier.js";
import { runSchemaProjectValidation } from "../../lib/validation/staticProjectValidator.js";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import { ALLOWED_DEPENDENCIES } from "../../lib/allowlist.js";
import type { PipelineState } from "../types.js";

function getPreviousAttemptSummaries(state: PipelineState): string[] {
  return (state.repairAttempts ?? []).map(
    (attempt) =>
      `Attempt ${attempt.attemptNumber}: ${attempt.patchSummary ?? "no summary"} (${attempt.status})${
        attempt.failureReason ? ` - ${attempt.failureReason}` : ""
      }`,
  );
}

export const automaticRepairStage: StageExecutor = async (input, context) => {
  const state = input as PipelineState;
  const sandbox = state.sandboxValidation;
  const project = state.generatedProject;

  if (!project) {
    return {
      status: "failed",
      errorCode: ErrorCode.REPAIR_NOT_POSSIBLE,
      errorMessage: "Automatic repair requires a generated project.",
      durationMs: 0,
    };
  }

  if (sandbox?.compilation.success && sandbox.runtime.success) {
    return {
      status: "completed",
      output: {
        repairRequired: false,
        repairStatus: "succeeded" as const,
        repairImplemented: true,
      },
      durationMs: 0,
    };
  }

  if (state.repairInProgress) {
    return {
      status: "failed",
      errorCode: ErrorCode.INTERNAL_ERROR,
      errorMessage: "Repair is already in progress for this generation.",
      durationMs: 0,
    };
  }

  const attemptNumber = (state.repairAttempts?.length ?? 0) + 1;
  const diagnostics = collectRepairDiagnostics({
    staticValidation: state.staticValidation,
    sandboxValidation: sandbox,
  });

  const previousAttempts = state.repairAttempts ?? [];
  const previousFingerprints = previousAttempts.map((attempt) => attempt.patchFingerprint).filter(Boolean);
  const previousDiagnosticFingerprints = previousAttempts
    .map((attempt) => attempt.diagnosticsFingerprint)
    .filter(Boolean);

  const currentDiagnosticFingerprint = diagnosticsFingerprint(diagnostics);
  const repeatedDiagnosticsDetected = previousDiagnosticFingerprints.includes(currentDiagnosticFingerprint);

  const classification = classifyRepairability({
    diagnostics,
    staticValidation: state.staticValidation,
    attemptCount: attemptNumber - 1,
    maxAttempts: context.repairConfig.maxAttempts,
    hasGeneratedProject: true,
    repeatedDiagnosticsDetected,
  });

  if (!classification.repairable) {
    return {
      status: "failed",
      errorCode: repeatedDiagnosticsDetected
        ? ErrorCode.REPEATED_DIAGNOSTICS
        : attemptNumber > context.repairConfig.maxAttempts
          ? ErrorCode.REPAIR_ATTEMPTS_EXHAUSTED
          : ErrorCode.REPAIR_NOT_POSSIBLE,
      errorMessage: classification.reasons.join("; "),
      durationMs: 0,
      output: {
        repairRequired: true,
        repairStatus: repeatedDiagnosticsDetected
          ? ("failed" as const)
          : attemptNumber > context.repairConfig.maxAttempts
            ? ("exhausted" as const)
            : ("not_possible" as const),
      },
    };
  }

  if (attemptNumber > context.repairConfig.maxAttempts) {
    return {
      status: "failed",
      errorCode: ErrorCode.REPAIR_ATTEMPTS_EXHAUSTED,
      errorMessage: "Maximum repair attempts reached.",
      durationMs: 0,
      output: {
        repairRequired: true,
        repairStatus: "exhausted" as const,
      },
    };
  }

  const projectHashBefore = state.projectHash ?? computeProjectHash(project);
  const startedAt = new Date().toISOString();

  try {
    const prompt = context.loadPrompt("project-repair");
    const allowlist = JSON.stringify([...ALLOWED_DEPENDENCIES].sort());
    const invocation = await context.aiProvider.invoke(
      [
        { text: prompt.content },
        { text: `Approved dependency allowlist:\n${allowlist}` },
        { text: `DesignAnalysisV1 summary:\n${state.designAnalysis?.layoutHierarchy ?? "Unavailable"}` },
        { text: `Confirmed GenerationPlanV1:\n${JSON.stringify(state.generationPlan)}` },
        { text: `Current GeneratedProjectV1:\n${JSON.stringify(project)}` },
        { text: `Current diagnostics:\n${JSON.stringify(diagnostics)}` },
        { text: `Previous repair attempts:\n${JSON.stringify(getPreviousAttemptSummaries(state))}` },
      ],
      {
        promptVersion: prompt.meta.promptVersion,
        model: context.aiConfig.model,
        temperature: context.aiConfig.temperature,
        maxTokens: context.aiConfig.maxTokens,
        timeoutMs: context.aiConfig.timeoutMs,
      },
    );

    const parsedPatch = parseProjectPatchResponse(invocation.rawText);
    if (!parsedPatch.ok) {
      return {
        status: "failed",
        errorCode: parsedPatch.errorCode,
        errorMessage: parsedPatch.message,
        durationMs: invocation.latencyMs,
        output: {
          repairRequired: true,
          repairStatus: "failed" as const,
          manualRetryAllowed: parsedPatch.errorCode === ErrorCode.AI_RESPONSE_VERSION_MISSING,
        },
      };
    }

    const normalizedPatchFingerprint = patchFingerprint(parsedPatch.patch);
    if (previousFingerprints.includes(normalizedPatchFingerprint)) {
      return {
        status: "failed",
        errorCode: ErrorCode.REPEATED_PATCH,
        errorMessage: "Repeated identical patch detected.",
        durationMs: invocation.latencyMs,
        output: {
          repairRequired: true,
          repairStatus: "failed" as const,
        },
      };
    }

    const patchValidation = validateProjectPatch(parsedPatch.patch, {
      maxFileBytes: context.repairConfig.maxPatchFileBytes,
      maxTotalBytes: context.repairConfig.maxPatchTotalBytes,
    });

    if (!patchValidation.ok) {
      return {
        status: "failed",
        errorCode: patchValidation.errorCode,
        errorMessage: patchValidation.message,
        durationMs: invocation.latencyMs,
        output: {
          repairRequired: true,
          repairStatus: patchValidation.errorCode === ErrorCode.PATCH_SECURITY_VIOLATION ? ("failed" as const) : ("failed" as const),
          manualRetryAllowed: false,
        },
      };
    }

    const applied = applyProjectPatch(project, patchValidation.patch);
    if (!applied.ok) {
      return {
        status: "failed",
        errorCode: ErrorCode.PATCH_APPLY_FAILED,
        errorMessage: applied.message,
        durationMs: invocation.latencyMs,
        output: {
          repairRequired: true,
          repairStatus: "failed" as const,
        },
      };
    }

    const schemaValidation = runSchemaProjectValidation(applied.result.project);
    const completedAt = new Date().toISOString();
    const attemptRecord = {
      attemptNumber,
      startedAt,
      completedAt,
      status: "waiting_for_revalidation" as const,
      provider: invocation.provider,
      model: invocation.model,
      promptVersion: prompt.meta.promptVersion,
      inputTokens: invocation.inputTokens,
      outputTokens: invocation.outputTokens,
      latencyMs: invocation.latencyMs,
      diagnosticsBefore: diagnostics,
      diagnosticsFingerprint: currentDiagnosticFingerprint,
      repairabilityClassification: classification,
      patchSummary: patchValidation.patch.repairSummary,
      patchFingerprint: normalizedPatchFingerprint,
      changedFiles: patchValidation.patch.changedFiles.map((file) => {
        const before = project.files.find((item) => item.path === file.path)?.content;
        return {
          ...file,
          afterContent: file.fullContent,
          beforeContent: before,
        };
      }),
      deletedFiles: patchValidation.patch.deletedFiles,
      dependencyChanges: patchValidation.patch.dependencyChanges,
      projectHashBefore,
      projectHashAfter: applied.result.projectHash,
      staticValidationAfter: applied.result.staticValidation,
      failureReason: undefined,
      repeatedPatchDetected: false,
      repeatedDiagnosticsDetected,
      unresolvedRisks: patchValidation.patch.unresolvedRisks,
    };

    if (applied.result.projectHash === projectHashBefore && patchValidation.patch.changedFiles.length > 0) {
      return {
        status: "failed",
        errorCode: ErrorCode.REPEATED_PATCH,
        errorMessage: "Patch did not change the project hash.",
        durationMs: invocation.latencyMs,
        output: {
          repairRequired: true,
          repairStatus: "failed" as const,
        },
      };
    }

    return {
      status: "paused",
      durationMs: invocation.latencyMs,
      output: {
        generatedProject: applied.result.project,
        projectHash: applied.result.projectHash,
        schemaValidation,
        staticValidation: applied.result.staticValidation,
        sandboxValidation: undefined,
        validationReportFingerprint: null,
        awaitingSandboxValidation: true,
        repairRequired: true,
        repairImplemented: true,
        repairStatus: "waiting_for_revalidation" as const,
        currentRepairAttempt: attemptNumber,
        repairAttempts: [...(state.repairAttempts ?? []), attemptRecord],
        repairInProgress: false,
        manualRetryAllowed: false,
      },
    } satisfies StageResult<Partial<PipelineState>>;
  } catch (error) {
    if (error instanceof AIProviderError) {
      return {
        status: "failed",
        errorCode: error.errorCode,
        errorMessage: error.message,
        durationMs: 0,
        output: {
          repairRequired: true,
          repairStatus: "failed" as const,
          manualRetryAllowed: error.errorCode === ErrorCode.AI_TIMEOUT,
        },
      };
    }

    return {
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: "Automatic repair provider failed unexpectedly.",
      durationMs: 0,
      output: {
        repairRequired: true,
        repairStatus: "failed" as const,
        manualRetryAllowed: true,
      },
    };
  }
};
