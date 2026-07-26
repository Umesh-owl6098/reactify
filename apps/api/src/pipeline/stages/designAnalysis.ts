import type { AnalysisMetadata } from "@reactify/generation-contracts";
import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { parseDesignAnalysisResponse } from "../../lib/parseDesignAnalysis.js";
import { extractSafeOpenAIErrorFields } from "../../providers/openai-error-utils.js";
import { isAIProviderError } from "../../providers/provider-errors.js";
import { UsageLimitError } from "../../usage/usage-service.js";
import { toProviderFailureMetadata } from "../../jobs/provider-failure-metadata.js";
import type { PipelineState } from "../types.js";

export const designAnalysisStage: StageExecutor = async (input, context) => {
  const state = input as PipelineState;

  if (!state.imageInput) {
    return {
      status: "failed",
      errorCode: ErrorCode.IMAGE_NOT_FOUND,
      errorMessage: "Prepared image input is missing for design analysis.",
      durationMs: 0,
    };
  }

  try {
    const prompt = context.loadPrompt("design-analysis");

    context.logger.info("provider_invocation_started", {
      generationId: context.generationId,
      stage: "design_analysis",
      provider: context.aiProvider.providerName,
      model: context.aiConfig.model,
    });

    const invocation = await context.aiProvider.invoke(
      [{ text: prompt.content }, state.imageInput],
      {
        promptVersion: prompt.meta.promptVersion,
        model: context.aiConfig.model,
        temperature: context.aiConfig.temperature,
        maxTokens: context.aiConfig.maxTokens,
        timeoutMs: context.aiConfig.timeoutMs,
      },
    );

    context.logger.info("provider_invocation_completed", {
      generationId: context.generationId,
      stage: "design_analysis",
      provider: invocation.provider,
      model: invocation.model,
      latencyMs: invocation.latencyMs,
      providerRequestId: invocation.providerRequestId,
    });

    const parsed = parseDesignAnalysisResponse(invocation.rawText);
    if (!parsed.ok) {
      context.logger.error("design_analysis_validation_failed", {
        generationId: context.generationId,
        model: invocation.model,
        errorCode: parsed.errorCode,
        validationIssues: parsed.validationIssues?.slice(0, 20),
      });

      return {
        status: "failed",
        errorCode: parsed.errorCode,
        errorMessage: parsed.message,
        durationMs: invocation.latencyMs,
      };
    }

    const analysisMetadata: AnalysisMetadata = {
      provider: invocation.provider,
      model: invocation.model,
      promptVersion: prompt.meta.promptVersion,
      schemaVersion: prompt.meta.schemaVersion,
      inputTokens: invocation.inputTokens,
      outputTokens: invocation.outputTokens,
      latencyMs: invocation.latencyMs,
      temperature: context.aiConfig.temperature,
      generatedAt: new Date().toISOString(),
    };

    context.logger.info("design_analysis_completed", {
      generationId: context.generationId,
      provider: analysisMetadata.provider,
      model: analysisMetadata.model,
      promptVersion: analysisMetadata.promptVersion,
      inputTokens: analysisMetadata.inputTokens,
      outputTokens: analysisMetadata.outputTokens,
      latencyMs: analysisMetadata.latencyMs,
    });

    return {
      status: "completed",
      output: {
        designAnalysis: parsed.designAnalysis,
        analysisMetadata,
      },
      durationMs: invocation.latencyMs,
    } satisfies StageResult<Partial<PipelineState>>;
  } catch (error) {
    if (error instanceof UsageLimitError) {
      context.logger.error("provider_invocation_failed", {
        generationId: context.generationId,
        stage: "design_analysis",
        provider: context.aiProvider.providerName,
        model: context.aiConfig.model,
        failureCode: error.code,
        message: error.message,
        reachedOpenAI: false,
      });

      return {
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
        durationMs: 0,
      };
    }

    if (isAIProviderError(error)) {
      const safeFields = extractSafeOpenAIErrorFields(error);
      context.logger.error("provider_invocation_failed", {
        generationId: context.generationId,
        stage: "design_analysis",
        provider: context.aiProvider.providerName,
        model: context.aiConfig.model,
        failureCode: error.errorCode,
        ...safeFields,
      });

      return {
        status: "failed",
        errorCode: error.errorCode,
        errorMessage: error.message,
        providerMetadata: toProviderFailureMetadata(safeFields),
        durationMs: 0,
      };
    }

    context.logger.error("provider_invocation_failed", {
      generationId: context.generationId,
      stage: "design_analysis",
      provider: context.aiProvider.providerName,
      model: context.aiConfig.model,
      failureCode: ErrorCode.AI_ERROR,
      message: error instanceof Error ? error.message : "Unknown provider error",
      reachedOpenAI: false,
    });

    return {
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: "Design analysis provider failed unexpectedly.",
      durationMs: 0,
    };
  }
};
