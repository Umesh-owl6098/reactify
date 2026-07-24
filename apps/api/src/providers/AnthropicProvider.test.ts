import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import {
  AIProviderError,
  AnthropicProvider,
  type AnthropicClientLike,
} from "./AnthropicProvider.js";

function createMockClient(
  response: Awaited<ReturnType<AnthropicClientLike["messages"]["create"]>>,
): AnthropicClientLike {
  return {
    messages: {
      create: vi.fn().mockResolvedValue(response),
    },
  };
}

describe("AnthropicProvider", () => {
  it("converts text and image inputs into Anthropic message content", async () => {
    const client = createMockClient({
      id: "msg_123",
      model: "claude-3-5-sonnet-20241022",
      content: [{ type: "text", text: '{"schemaVersion":"1"}' }],
      usage: { input_tokens: 120, output_tokens: 340 },
    });
    const provider = new AnthropicProvider(client, "claude-3-5-sonnet-20241022");

    await provider.invoke(
      [{ text: "Analyze this screenshot" }, { base64: "abc123", mimeType: "image/png" }],
      {
        promptVersion: "1.0.0",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.2,
        maxTokens: 4096,
        timeoutMs: 5000,
      },
    );

    expect(client.messages.create).toHaveBeenCalledWith(
      {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4096,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this screenshot" },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "abc123",
                },
              },
            ],
          },
        ],
      },
      { timeout: 5000 },
    );
  });

  it("extracts text blocks and token usage from the response", async () => {
    const client = createMockClient({
      id: "msg_123",
      model: "claude-3-5-sonnet-20241022",
      content: [
        { type: "text", text: '{"schemaVersion":"1",' },
        { type: "text", text: '"responseVersion":"2026-01-01T00:00:00.000Z"}' },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const provider = new AnthropicProvider(client, "claude-3-5-sonnet-20241022");

    const result = await provider.invoke([{ text: "prompt" }], {
      promptVersion: "1.0.0",
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.1,
      timeoutMs: 1000,
    });

    expect(result.rawText).toBe(
      '{"schemaVersion":"1","responseVersion":"2026-01-01T00:00:00.000Z"}',
    );
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(20);
    expect(result.totalTokens).toBe(30);
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-3-5-sonnet-20241022");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("maps timeout failures to AI_TIMEOUT", async () => {
    const client: AnthropicClientLike = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("Request timed out")),
      },
    };
    const provider = new AnthropicProvider(client, "claude-3-5-sonnet-20241022");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AI_TIMEOUT,
    });
  });

  it("maps provider failures to AI_ERROR", async () => {
    const client: AnthropicClientLike = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("Upstream failure")),
      },
    };
    const provider = new AnthropicProvider(client, "claude-3-5-sonnet-20241022");

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toBeInstanceOf(AIProviderError);

    await expect(
      provider.invoke([{ text: "prompt" }], {
        promptVersion: "1.0.0",
        model: "claude-3-5-sonnet-20241022",
        temperature: 0.2,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.AI_ERROR,
    });
  });
});
