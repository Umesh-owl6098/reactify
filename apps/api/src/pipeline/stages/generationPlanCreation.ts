import type { PlanMetadata } from "@reactify/generation-contracts";
import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { parseGenerationPlanResponse } from "../../lib/parseGenerationPlan.js";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import type { PipelineState } from "../types.js";

export const generationPlanCreationStage: StageExecutor = async (input, context) => {
  const state = input as PipelineState;

  if (!state.designAnalysis) {
    return {
      status: "failed",
      errorCode: ErrorCode.PLAN_SCHEMA_INVALID,
      errorMessage: "Design analysis is missing for generation plan creation.",
      durationMs: 0,
    };
  }

  try {
    const prompt = context.loadPrompt("generation-plan");
    const analysisJson = JSON.stringify(state.designAnalysis);
    const invocation = await context.aiProvider.invoke(
      [
        { text: prompt.content },
        { text: `DesignAnalysisV1 input:\n${analysisJson}` },
      ],
      {
        promptVersion: prompt.meta.promptVersion,
        model: context.aiConfig.model,
        temperature: context.aiConfig.temperature,
        maxTokens: context.aiConfig.maxTokens,
        timeoutMs: context.aiConfig.timeoutMs,
      },
    );

    const parsed = parseGenerationPlanResponse(invocation.rawText);
    if (!parsed.ok) {
      return {
        status: "failed",
        errorCode: parsed.errorCode,
        errorMessage: parsed.message,
        durationMs: invocation.latencyMs,
      };
    }

    const planMetadata: PlanMetadata = {
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

    context.logger.info("generation_plan_creation_completed", {
      generationId: context.generationId,
      provider: planMetadata.provider,
      model: planMetadata.model,
      promptVersion: planMetadata.promptVersion,
      inputTokens: planMetadata.inputTokens,
      outputTokens: planMetadata.outputTokens,
      latencyMs: planMetadata.latencyMs,
    });

    return {
      status: "completed",
      output: {
        generationPlan: parsed.generationPlan,
        planMetadata,
      },
      durationMs: invocation.latencyMs,
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

    context.logger.error("generation_plan_creation_failed", {
      generationId: context.generationId,
      message: error instanceof Error ? error.message : "Unknown provider error",
    });

    return {
      status: "failed",
      errorCode: ErrorCode.AI_ERROR,
      errorMessage: "Generation plan provider failed unexpectedly.",
      durationMs: 0,
    };
  }
};
