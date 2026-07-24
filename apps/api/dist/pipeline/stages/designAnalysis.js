import { ErrorCode } from "@reactify/shared";
import { parseDesignAnalysisResponse } from "../../lib/parseDesignAnalysis.js";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
export const designAnalysisStage = async (input, context) => {
    const state = input;
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
        const invocation = await context.aiProvider.invoke([{ text: prompt.content }, state.imageInput], {
            promptVersion: prompt.meta.promptVersion,
            model: context.aiConfig.model,
            temperature: context.aiConfig.temperature,
            maxTokens: context.aiConfig.maxTokens,
            timeoutMs: context.aiConfig.timeoutMs,
        });
        const parsed = parseDesignAnalysisResponse(invocation.rawText);
        if (!parsed.ok) {
            return {
                status: "failed",
                errorCode: parsed.errorCode,
                errorMessage: parsed.message,
                durationMs: invocation.latencyMs,
            };
        }
        const analysisMetadata = {
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
        };
    }
    catch (error) {
        if (error instanceof AIProviderError) {
            return {
                status: "failed",
                errorCode: error.errorCode,
                errorMessage: error.message,
                durationMs: 0,
            };
        }
        context.logger.error("design_analysis_failed", {
            generationId: context.generationId,
            message: error instanceof Error ? error.message : "Unknown provider error",
        });
        return {
            status: "failed",
            errorCode: ErrorCode.AI_ERROR,
            errorMessage: "Design analysis provider failed unexpectedly.",
            durationMs: 0,
        };
    }
};
//# sourceMappingURL=designAnalysis.js.map