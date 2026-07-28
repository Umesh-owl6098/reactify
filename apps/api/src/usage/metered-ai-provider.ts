import type { AIInput, AIInvocationOptions, AIInvocationResult, AIProvider } from "@reactify/shared";
import { getUsageContext, markProviderInvoked } from "./usage-context.js";
import type { UsageService } from "./usage-service.js";
import { logError, logEvent } from "../lib/structured-log.js";
import { createRequestFingerprint } from "./usage-repository.js";

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
    let invocationReservationId: string | undefined;
    let invocationNumber: number | undefined;
    logEvent("metered_provider_invoke_started", {
      provider: this.providerName,
      model: options.model,
      hasUsageContext: Boolean(context),
      operationType: context?.operationType,
      jobId: context?.jobId,
      generationId: context?.generationId,
    });

    if (context) {
      invocationNumber = context.invocationNumber + 1;
      invocationReservationId = await this.usageService.ensureInvocationReservation({
        reservationId: context.reservationId,
        ownerId: context.ownerId,
        generationId: context.generationId,
        jobId: context.jobId,
        operationType: context.operationType,
        attemptNumber: context.attemptNumber,
        provider: this.providerName,
        model: options.model,
        maxOutputTokens: options.maxTokens ?? 8192,
      });
      context.reservationId = invocationReservationId;
      context.invocationNumber = invocationNumber;
    }

    try {
      markProviderInvoked();
      const result = await this.inner.invoke(inputs, options);

      if (context && invocationReservationId && invocationNumber) {
        await this.usageService.reconcileProviderUsage({
          reservationId: invocationReservationId,
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
          requestFingerprint: createRequestFingerprint(
            context.jobId,
            context.attemptNumber,
            invocationNumber === 1 ? "primary" : `invoke-${invocationNumber}`,
          ),
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
      if (invocationReservationId) {
        try {
          await this.usageService.repository.releaseReservation(invocationReservationId);
        } catch (releaseError) {
          logError("metered_provider_reservation_release_failed", releaseError, {
            provider: this.providerName,
            model: options.model,
            jobId: context?.jobId,
            generationId: context?.generationId,
            invocationNumber,
          });
        }
      }
      logError("metered_provider_invoke_failed", error, {
        provider: this.providerName,
        model: options.model,
        jobId: context?.jobId,
        generationId: context?.generationId,
        invocationNumber,
      });
      throw error;
    }
  }
}

export function wrapWithUsageMetering(provider: AIProvider, usageService: UsageService): AIProvider {
  return new MeteredAIProvider(provider, usageService);
}
