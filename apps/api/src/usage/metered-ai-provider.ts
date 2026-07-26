import type { AIInput, AIInvocationOptions, AIInvocationResult, AIProvider } from "@reactify/shared";
import { getUsageContext, markProviderInvoked } from "./usage-context.js";
import type { UsageService } from "./usage-service.js";
import { logError, logEvent } from "../lib/structured-log.js";

export class MeteredAIProvider implements AIProvider {
  readonly providerName: string;

  constructor(
    private readonly inner: AIProvider,
    private readonly usageService: UsageService,
  ) {
    this.providerName = inner.providerName;
  }

  get defaultModel(): string {
    return this.inner.defaultModel;
  }

  async invoke(inputs: AIInput[], options: AIInvocationOptions): Promise<AIInvocationResult> {
    const context = getUsageContext();
    logEvent("metered_provider_invoke_started", {
      provider: this.providerName,
      model: options.model,
      hasUsageContext: Boolean(context),
      operationType: context?.operationType,
      jobId: context?.jobId,
      generationId: context?.generationId,
    });

    if (context) {
      await this.usageService.verifyReservation({
        reservationId: context.reservationId,
        ownerId: context.ownerId,
        jobId: context.jobId,
        attemptNumber: context.attemptNumber,
      });
    }

    try {
      const result = await this.inner.invoke(inputs, options);
      markProviderInvoked();

      if (context) {
        await this.usageService.reconcileProviderUsage({
          reservationId: context.reservationId,
          ownerId: context.ownerId,
          generationId: context.generationId,
          jobId: context.jobId,
          operationType: context.operationType,
          attemptNumber: context.attemptNumber,
          provider: result.provider,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          providerRequestId: result.providerRequestId,
          usageSource: result.usageSource ?? "provider_reported",
        });
      }

      logEvent("metered_provider_invoke_completed", {
        provider: result.provider,
        model: result.model,
        jobId: context?.jobId,
        generationId: context?.generationId,
      });

      return result;
    } catch (error) {
      logError("metered_provider_invoke_failed", error, {
        provider: this.providerName,
        model: options.model,
        jobId: context?.jobId,
        generationId: context?.generationId,
      });
      throw error;
    }
  }
}

export function wrapWithUsageMetering(provider: AIProvider, usageService: UsageService): AIProvider {
  return new MeteredAIProvider(provider, usageService);
}
