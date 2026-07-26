import type { GeneratedProjectV1, ProjectMetadata } from "@reactify/generation-contracts";
import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { ALLOWED_DEPENDENCIES } from "../../lib/allowlist.js";
import {
  summarizeFidelityIssues,
  validateVisualFidelity,
  type VisualFidelityReport,
} from "../../lib/visual-fidelity/visualFidelityValidator.js";
import { GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT, GENERATED_PROJECT_V1_RESPONSE_FORMAT } from "../../lib/generated-project-json-schema.js";
import {
  buildGeneratedProjectValidationLogFields,
  isRepairableGeneratedProjectFailure,
  parseGeneratedProjectResponseDetailed,
} from "../../lib/parseGeneratedProject.js";
import { truncateForSafeLog } from "../../lib/formatValidationIssues.js";
import { AIProviderError } from "../../providers/provider-errors.js";
import type { PipelineState } from "../types.js";

const MAX_SCHEMA_REPAIR_ATTEMPTS = 1;

/**
 * Bounded so a model that keeps dropping the same object cannot spend the whole
 * generation budget re-attempting it. Two retries is enough to recover from a
 * single lapse without turning a failure into a stall.
 */
const MAX_VISUAL_REPAIR_ATTEMPTS = 2;

export const reactProjectGenerationStage: StageExecutor = async (input, context) => {
  const state = input as PipelineState;

  if (!state.planConfirmed || !state.generationPlan || !state.designAnalysis) {
    return {
      status: "failed",
      errorCode: ErrorCode.PLAN_SCHEMA_INVALID,
      errorMessage: "Confirmed generation plan and design analysis are required before code generation.",
      durationMs: 0,
    };
  }

  try {
    const prompt = context.loadPrompt("react-project-generation");
    const allowlist = JSON.stringify([...ALLOWED_DEPENDENCIES].sort());
    const analysisJson = JSON.stringify(state.designAnalysis);
    const planJson = JSON.stringify(state.generationPlan);
    const baseInputs = [
      { text: prompt.content },
      { text: `Approved dependency allowlist:\n${allowlist}` },
      { text: `DesignAnalysisV1 input:\n${analysisJson}` },
      { text: `Confirmed GenerationPlanV1 input:\n${planJson}` },
    ];

    const structuredFormat = GENERATED_PROJECT_V1_RESPONSE_FORMAT;
    const invokeOptionsBase = {
      promptVersion: prompt.meta.promptVersion,
      model: context.aiConfig.model,
      temperature: context.aiConfig.temperature,
      maxTokens: context.aiConfig.maxTokens,
      timeoutMs: Math.max(context.aiConfig.timeoutMs, 180_000),
    };

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalLatencyMs = 0;
    let provider = context.aiProvider.providerName;
    let model = context.aiConfig.model;
    let providerRequestId: string | undefined;
    let responseFormatUsed: string = structuredFormat.type;

    let initialInvocation;
    try {
      initialInvocation = await context.aiProvider.invoke(baseInputs, {
        ...invokeOptionsBase,
        responseFormat: structuredFormat,
      });
    } catch (error) {
      if (
        error instanceof AIProviderError &&
        error.errorCode === ErrorCode.AI_REQUEST_INVALID
      ) {
        context.logger.warn("react_project_generation_schema_format_fallback", {
          generationId: context.generationId,
          message: error.message,
        });
        responseFormatUsed = GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT.type;
        initialInvocation = await context.aiProvider.invoke(baseInputs, {
          ...invokeOptionsBase,
          responseFormat: GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT,
        });
      } else {
        throw error;
      }
    }
    totalInputTokens += initialInvocation.inputTokens;
    totalOutputTokens += initialInvocation.outputTokens;
    totalLatencyMs += initialInvocation.latencyMs;
    provider = initialInvocation.provider;
    model = initialInvocation.model;
    providerRequestId = initialInvocation.providerRequestId;

    let parsed = parseGeneratedProjectResponseDetailed(initialInvocation.rawText, state.generationPlan);
    let schemaRepairAttempts = 0;

    if (!parsed.ok) {
      context.logger.error(
        "react_project_generation_validation_failed",
        buildGeneratedProjectValidationLogFields(parsed, {
          generationId: context.generationId,
          model,
          rawText: initialInvocation.rawText,
        }),
      );
    }

    while (!parsed.ok && isRepairableGeneratedProjectFailure(parsed) && schemaRepairAttempts < MAX_SCHEMA_REPAIR_ATTEMPTS) {
      schemaRepairAttempts += 1;
      const repairPrompt = context.loadPrompt("react-project-generation-repair");
      const repairInvocation = await context.aiProvider.invoke(
        [
          { text: repairPrompt.content },
          {
            text: `Validation errors:\n${JSON.stringify(parsed.validationIssues.slice(0, 20), null, 2)}`,
          },
          {
            text: `Expected GeneratedProjectV1 schema summary:\n${JSON.stringify(
              {
                schemaVersion: "1",
                responseVersion: "ISO-8601 string",
                projectName: "string",
                summary: "string",
                dependencies: "record<string,string>",
                devDependencies: "record<string,string> optional",
                files: "array of { path, language, content, purpose, componentMetadata? }",
                entryFile: "string",
                components: "array of component records",
                warnings: "string[]",
              },
              null,
              2,
            )}`,
          },
          {
            text: `Invalid response to repair:\n${truncateForSafeLog(initialInvocation.rawText, 4000)}`,
          },
          { text: `Approved dependency allowlist:\n${allowlist}` },
          { text: `DesignAnalysisV1 input:\n${analysisJson}` },
          { text: `Confirmed GenerationPlanV1 input:\n${planJson}` },
        ],
        {
          ...invokeOptionsBase,
          responseFormat:
            responseFormatUsed === "json_schema"
              ? structuredFormat
              : GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT,
        },
      );

      totalInputTokens += repairInvocation.inputTokens;
      totalOutputTokens += repairInvocation.outputTokens;
      totalLatencyMs += repairInvocation.latencyMs;
      provider = repairInvocation.provider;
      model = repairInvocation.model;
      providerRequestId = repairInvocation.providerRequestId;

      parsed = parseGeneratedProjectResponseDetailed(repairInvocation.rawText, state.generationPlan);
      if (!parsed.ok) {
        context.logger.error(
          "react_project_generation_repair_failed",
          buildGeneratedProjectValidationLogFields(parsed, {
            generationId: context.generationId,
            model,
            rawText: repairInvocation.rawText,
          }),
        );
      } else {
        context.logger.info("react_project_generation_repair_succeeded", {
          generationId: context.generationId,
          schemaRepairAttempts,
          model,
        });
      }
    }

    if (!parsed.ok) {
      return {
        status: "failed",
        errorCode: parsed.errorCode,
        errorMessage: parsed.message,
        durationMs: totalLatencyMs,
      };
    }

    // Schema-valid code can still have lost most of the source composition, so
    // re-check the geometry and give the model a bounded chance to restore it.
    const composition = state.designAnalysis.visualComposition;
    let generatedProject: GeneratedProjectV1 = parsed.generatedProject;
    let fidelityReport: VisualFidelityReport | null = composition
      ? validateVisualFidelity(composition, generatedProject)
      : null;
    let visualRepairAttempts = 0;

    while (composition && fidelityReport && !fidelityReport.acceptable && visualRepairAttempts < MAX_VISUAL_REPAIR_ATTEMPTS) {
      visualRepairAttempts += 1;

      context.logger.warn("visual_fidelity_repair_started", {
        generationId: context.generationId,
        attempt: visualRepairAttempts,
        coverage: fidelityReport.coverage,
        issueCodes: fidelityReport.issues.map((issue) => issue.code),
      });

      const repairInvocation = await context.aiProvider.invoke(
        [
          ...baseInputs,
          {
            text: `Your previous response lost part of the source composition. Regenerate the complete project and fix every issue below.\n\n${summarizeFidelityIssues(
              fidelityReport,
            )}`,
          },
          {
            text: `Every object in visualComposition.objects must appear in the output, positioned from its normalized box. Draw non-rectangular objects with inline SVG. Do not emit invented placeholder text.`,
          },
        ],
        {
          ...invokeOptionsBase,
          responseFormat:
            responseFormatUsed === "json_schema" ? structuredFormat : GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT,
        },
      );

      totalInputTokens += repairInvocation.inputTokens;
      totalOutputTokens += repairInvocation.outputTokens;
      totalLatencyMs += repairInvocation.latencyMs;
      provider = repairInvocation.provider;
      model = repairInvocation.model;
      providerRequestId = repairInvocation.providerRequestId;

      const repaired = parseGeneratedProjectResponseDetailed(repairInvocation.rawText, state.generationPlan);
      if (!repaired.ok) {
        context.logger.warn("visual_fidelity_repair_unparseable", {
          generationId: context.generationId,
          attempt: visualRepairAttempts,
          errorCode: repaired.errorCode,
        });
        break;
      }

      const repairedReport = validateVisualFidelity(composition, repaired.generatedProject);
      // Only adopt the retry when it genuinely covers more of the source; a
      // regression would otherwise be locked in by the last attempt winning.
      if (repairedReport.coverage >= fidelityReport.coverage && repairedReport.issues.length <= fidelityReport.issues.length) {
        generatedProject = repaired.generatedProject;
        fidelityReport = repairedReport;
      }

      if (fidelityReport.acceptable) {
        context.logger.info("visual_fidelity_repair_succeeded", {
          generationId: context.generationId,
          attempt: visualRepairAttempts,
          coverage: fidelityReport.coverage,
        });
      }
    }

    if (fidelityReport && !fidelityReport.acceptable) {
      // Reported, not fatal: a structurally imperfect preview is still more
      // useful to review than a failed generation, and the visual comparison
      // stage surfaces the same gap with real numbers.
      context.logger.warn("visual_fidelity_unresolved", {
        generationId: context.generationId,
        visualRepairAttempts,
        coverage: fidelityReport.coverage,
        checkedObjects: fidelityReport.checkedObjects,
        representedObjects: fidelityReport.representedObjects,
        issueCodes: fidelityReport.issues.map((issue) => issue.code),
      });
    }

    const projectMetadata: ProjectMetadata = {
      provider,
      model,
      promptVersion: prompt.meta.promptVersion,
      schemaVersion: prompt.meta.schemaVersion,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      latencyMs: totalLatencyMs,
      temperature: context.aiConfig.temperature,
      generatedAt: new Date().toISOString(),
    };

    context.logger.info("react_project_generation_completed", {
      generationId: context.generationId,
      provider: projectMetadata.provider,
      model: projectMetadata.model,
      promptVersion: projectMetadata.promptVersion,
      inputTokens: projectMetadata.inputTokens,
      outputTokens: projectMetadata.outputTokens,
      latencyMs: projectMetadata.latencyMs,
      providerRequestId,
      responseFormatUsed,
      schemaRepairAttempts,
      normalizationApplied: parsed.normalizationApplied,
      visualRepairAttempts,
      visualFidelityAcceptable: fidelityReport?.acceptable ?? null,
      visualFidelityCoverage: fidelityReport?.coverage ?? null,
    });

    return {
      status: "completed",
      output: {
        generatedProject,
        projectMetadata,
        visualFidelity: fidelityReport,
      },
      durationMs: totalLatencyMs,
    } satisfies StageResult<Partial<PipelineState>>;
  } catch (error) {
    if (error instanceof AIProviderError) {
      return {
        status: "failed",
        errorCode: error.errorCode,
        errorMessage: error.message,
        durationMs: 0,
      };
    }

    context.logger.error("react_project_generation_failed", {
      generationId: context.generationId,
      message: error instanceof Error ? error.message : "Unknown provider error",
    });

    return {
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: "React project generation provider failed unexpectedly.",
      durationMs: 0,
    };
  }
};
