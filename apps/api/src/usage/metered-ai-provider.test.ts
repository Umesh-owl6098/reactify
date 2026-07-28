import { describe, expect, it, vi } from "vitest";
import type { AIInvocationResult, AIProvider } from "@reactify/shared";
import { MeteredAIProvider } from "./metered-ai-provider.js";
import { runWithUsageContext } from "./usage-context.js";
import type { UsageService } from "./usage-service.js";

function invocationResult(requestId: string): AIInvocationResult {
  return {
    rawText: "{}",
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    latencyMs: 5,
    model: "gpt-test",
    provider: "openai",
    providerRequestId: requestId,
    usageSource: "provider_reported",
  };
}

describe("MeteredAIProvider", () => {
  it("uses a fresh reservation and usage fingerprint for each invocation in one job attempt", async () => {
    const inner: AIProvider = {
      providerName: "openai",
      defaultModel: "gpt-test",
      invoke: vi
        .fn()
        .mockResolvedValueOnce(invocationResult("req-1"))
        .mockResolvedValueOnce(invocationResult("req-2")),
    };
    const ensureInvocationReservation = vi
      .fn()
      .mockResolvedValueOnce("reservation-1")
      .mockResolvedValueOnce("reservation-2");
    const reconcileProviderUsage = vi.fn().mockResolvedValue(undefined);
    const releaseReservation = vi.fn().mockResolvedValue(undefined);
    const usageService = {
      ensureInvocationReservation,
      reconcileProviderUsage,
      repository: { releaseReservation },
    } as unknown as UsageService;
    const provider = new MeteredAIProvider(inner, usageService);

    await runWithUsageContext(
      {
        ownerId: "owner",
        generationId: "generation",
        jobId: "job",
        operationType: "react_project_generation",
        attemptNumber: 1,
        reservationId: "initial-reservation",
        invocationNumber: 0,
        providerInvoked: false,
      },
      async () => {
        const options = {
          promptVersion: "1",
          model: "gpt-test",
          maxTokens: 2048,
          timeoutMs: 1000,
        };
        await provider.invoke([{ text: "first" }], options);
        await provider.invoke([{ text: "repair" }], options);
      },
    );

    expect(ensureInvocationReservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reservationId: "initial-reservation" }),
    );
    expect(ensureInvocationReservation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ reservationId: "reservation-1" }),
    );
    expect(reconcileProviderUsage).toHaveBeenCalledTimes(2);
    expect(reconcileProviderUsage.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        reservationId: "reservation-1",
        requestFingerprint: expect.any(String),
      }),
    );
    expect(reconcileProviderUsage.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        reservationId: "reservation-2",
        requestFingerprint: expect.any(String),
      }),
    );
    expect(reconcileProviderUsage.mock.calls[0]?.[0].requestFingerprint).not.toBe(
      reconcileProviderUsage.mock.calls[1]?.[0].requestFingerprint,
    );
    expect(releaseReservation).not.toHaveBeenCalled();
  });

  it("releases only the active invocation reservation when the provider fails", async () => {
    const inner: AIProvider = {
      providerName: "openai",
      defaultModel: "gpt-test",
      invoke: vi.fn().mockRejectedValue(new Error("provider unavailable")),
    };
    const releaseReservation = vi.fn().mockResolvedValue(undefined);
    const usageService = {
      ensureInvocationReservation: vi.fn().mockResolvedValue("reservation-1"),
      reconcileProviderUsage: vi.fn(),
      repository: { releaseReservation },
    } as unknown as UsageService;
    const provider = new MeteredAIProvider(inner, usageService);

    await expect(
      runWithUsageContext(
        {
          ownerId: "owner",
          generationId: "generation",
          jobId: "job",
          operationType: "react_project_generation",
          attemptNumber: 1,
          reservationId: "initial-reservation",
          invocationNumber: 0,
          providerInvoked: false,
        },
        () =>
          provider.invoke([{ text: "first" }], {
            promptVersion: "1",
            model: "gpt-test",
            maxTokens: 2048,
            timeoutMs: 1000,
          }),
      ),
    ).rejects.toThrow("provider unavailable");

    expect(releaseReservation).toHaveBeenCalledWith("reservation-1");
  });
});
