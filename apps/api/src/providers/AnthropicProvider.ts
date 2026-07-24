import Anthropic from "@anthropic-ai/sdk";
import type {
  AIInput,
  AIInvocationOptions,
  AIInvocationResult,
  AIProvider,
} from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly errorCode: typeof ErrorCode.AI_TIMEOUT | typeof ErrorCode.AI_ERROR,
    readonly providerCause?: unknown,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AnthropicClientLike {
  messages: {
    create: (
      body: {
        model: string;
        max_tokens: number;
        temperature: number;
        messages: Array<{
          role: "user";
          content: Array<
            | { type: "text"; text: string }
            | {
                type: "image";
                source: {
                  type: "base64";
                  media_type: "image/png" | "image/jpeg" | "image/webp";
                  data: string;
                };
              }
          >;
        }>;
      },
      options?: { timeout?: number },
    ) => Promise<{
      model: string;
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export class AnthropicProvider implements AIProvider {
  readonly providerName = "anthropic";
  readonly defaultModel: string;

  constructor(
    private readonly client: AnthropicClientLike,
    defaultModel: string,
  ) {
    this.defaultModel = defaultModel;
  }

  async invoke(inputs: AIInput[], options: AIInvocationOptions): Promise<AIInvocationResult> {
    const startedAt = Date.now();

    const content = inputs.map((input) => {
      if ("base64" in input) {
        return {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: input.mimeType,
            data: input.base64,
          },
        };
      }

      return {
        type: "text" as const,
        text: input.text,
      };
    });

    try {
      const response = await this.client.messages.create(
        {
          model: options.model,
          max_tokens: options.maxTokens ?? 8192,
          temperature: options.temperature,
          messages: [{ role: "user", content }],
        },
        { timeout: options.timeoutMs },
      );

      const rawText = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      return {
        rawText,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - startedAt,
        model: response.model,
        provider: this.providerName,
      };
    } catch (error) {
      if (isTimeoutError(error)) {
        throw new AIProviderError("Anthropic request timed out.", ErrorCode.AI_TIMEOUT, error);
      }

      throw new AIProviderError("Anthropic request failed.", ErrorCode.AI_ERROR, error);
    }
  }
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === "TimeoutError" ||
    error.message.toLowerCase().includes("timeout") ||
    error.message.toLowerCase().includes("timed out")
  );
}

export function createAnthropicProvider(apiKey: string, defaultModel: string): AnthropicProvider {
  const client = new Anthropic({ apiKey });
  return new AnthropicProvider(client, defaultModel);
}
