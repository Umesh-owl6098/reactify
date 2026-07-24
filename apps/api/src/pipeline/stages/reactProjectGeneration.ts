import type { ProjectMetadata } from "@reactify/generation-contracts";
import { ErrorCode, type StageExecutor, type StageResult } from "@reactify/shared";
import { ALLOWED_DEPENDENCIES } from "../../lib/allowlist.js";
import { parseGeneratedProjectResponse } from "../../lib/parseGeneratedProject.js";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import type { PipelineState } from "../types.js";

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

    const invocation = await context.aiProvider.invoke(
      [
        { text: prompt.content },
        { text: `Approved dependency allowlist:\n${allowlist}` },
        { text: `DesignAnalysisV1 input:\n${analysisJson}` },
        { text: `Confirmed GenerationPlanV1 input:\n${planJson}` },
      ],
      {
        promptVersion: prompt.meta.promptVersion,
        model: context.aiConfig.model,
        temperature: context.aiConfig.temperature,
        maxTokens: context.aiConfig.maxTokens,
        timeoutMs: context.aiConfig.timeoutMs,
      },
    );

    const parsed = parseGeneratedProjectResponse(invocation.rawText, state.generationPlan);
    if (!parsed.ok) {
      return {
        status: "failed",
        errorCode: parsed.errorCode,
        errorMessage: parsed.message,
        durationMs: invocation.latencyMs,
      };
    }

    const projectMetadata: ProjectMetadata = {
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

    context.logger.info("react_project_generation_completed", {
      generationId: context.generationId,
      provider: projectMetadata.provider,
      model: projectMetadata.model,
      promptVersion: projectMetadata.promptVersion,
      inputTokens: projectMetadata.inputTokens,
      outputTokens: projectMetadata.outputTokens,
      latencyMs: projectMetadata.latencyMs,
    });

    return {
      status: "completed",
      output: {
        generatedProject: parsed.generatedProject,
        projectMetadata,
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
