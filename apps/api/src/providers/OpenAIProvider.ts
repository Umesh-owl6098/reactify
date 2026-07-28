import OpenAI from "openai";
import type {
  AbortSignalLike,
  AIInput,
  AIInvocationOptions,
  AIInvocationResult,
  AIProvider,
  AIResponseFormat,
} from "@reactify/shared";
import { ErrorCode } from "@reactify/shared";
import { AIProviderError } from "./provider-errors.js";
import { extractSafeOpenAIErrorFields, mapOpenAIError } from "./openai-error-utils.js";
import { logError, logEvent } from "../lib/structured-log.js";

export interface OpenAIResponsesClientLike {
  responses: {
    create: (
      body: {
        model: string;
        input: Array<{
          role: "user";
          content: Array<
            | { type: "input_text"; text: string }
            | { type: "input_image"; image_url: string; detail?: "auto" | "low" | "high" | "original" }
          >;
        }>;
        temperature?: number;
        max_output_tokens?: number;
        text?: {
          format?:
            | { type: "json_object" | "text" }
            | {
                type: "json_schema";
                name: string;
                schema: Record<string, unknown>;
                strict?: boolean;
              };
        };
      },
      options?: { signal?: AbortSignalLike; timeout?: number },
    ) => Promise<{
      id?: string;
      model: string;
      output_text: string;
      status?: "completed" | "incomplete" | "failed" | "cancelled" | "queued" | "in_progress";
      incomplete_details?: {
        reason?: string;
      } | null;
      error?: {
        code?: string;
        message?: string;
      } | null;
      refusal?: string | null;
      output?: Array<{
        type?: string;
        content?: Array<{
          type?: string;
          refusal?: string;
        }>;
      }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
    }>;
  };
}

function toDataUrl(input: Extract<AIInput, { base64: string }>): string {
  return `data:${input.mimeType};base64,${input.base64}`;
}

function summarizeInputs(inputs: AIInput[]): {
  textInputCount: number;
  imageInputCount: number;
  imageBytes: number;
  mimeTypes: string[];
} {
  let textInputCount = 0;
  let imageInputCount = 0;
  let imageBytes = 0;
  const mimeTypes: string[] = [];

  for (const input of inputs) {
    if ("base64" in input) {
      imageInputCount += 1;
      imageBytes += input.base64.length;
      mimeTypes.push(input.mimeType);
    } else {
      textInputCount += 1;
    }
  }

  return { textInputCount, imageInputCount, imageBytes, mimeTypes };
}

function summarizeRequestBody(inputs: AIInput[], model: string, maxOutputTokens: number, responseFormat?: AIResponseFormat) {
  const summary = summarizeInputs(inputs);
  return {
    model,
    maxOutputTokens,
    textInputCount: summary.textInputCount,
    imageInputCount: summary.imageInputCount,
    imageBytes: summary.imageBytes,
    mimeTypes: summary.mimeTypes,
    responseFormat: responseFormat?.type ?? "json_object",
    responseSchemaName: responseFormat?.type === "json_schema" ? responseFormat.name : undefined,
  };
}

function buildTextFormat(responseFormat?: AIResponseFormat) {
  if (responseFormat?.type === "json_schema") {
    return {
      format: {
        type: "json_schema" as const,
        name: responseFormat.name,
        schema: responseFormat.schema,
        strict: responseFormat.strict ?? true,
      },
    };
  }

  return {
    format: { type: "json_object" as const },
  };
}

type OpenAIResponse = Awaited<ReturnType<OpenAIResponsesClientLike["responses"]["create"]>>;

function responseContainsRefusal(response: OpenAIResponse): boolean {
  if (response.refusal) {
    return true;
  }

  return Boolean(
    response.output?.some((item) =>
      item.content?.some((content) => content.type === "refusal" || Boolean(content.refusal)),
    ),
  );
}

function assertCompletedResponse(response: OpenAIResponse): void {
  const safeMetadata = {
    providerRequestId: response.id,
    reachedProvider: true,
  };
  if (
    response.status === "incomplete" &&
    response.incomplete_details?.reason === "max_output_tokens"
  ) {
    throw new AIProviderError(
      "OpenAI response was truncated at the maximum output token limit.",
      ErrorCode.AI_RESPONSE_TRUNCATED,
      undefined,
      safeMetadata,
    );
  }

  if (responseContainsRefusal(response)) {
    throw new AIProviderError(
      "OpenAI refused to produce the requested response.",
      ErrorCode.AI_RESPONSE_REFUSED,
      undefined,
      safeMetadata,
    );
  }

  if (response.status === "failed") {
    const code = response.error?.code?.toLowerCase();
    if (code === "context_length_exceeded" || code === "max_context_length_exceeded") {
      throw new AIProviderError(
        "OpenAI context limit exceeded.",
        ErrorCode.AI_CONTEXT_LIMIT_EXCEEDED,
        undefined,
        safeMetadata,
      );
    }
    if (code === "invalid_api_key" || code === "authentication_error") {
      throw new AIProviderError(
        "OpenAI authentication failed.",
        ErrorCode.AI_AUTHENTICATION_FAILED,
        undefined,
        safeMetadata,
      );
    }
    if (code === "model_not_found") {
      throw new AIProviderError(
        "OpenAI model is not available.",
        ErrorCode.AI_MODEL_NOT_AVAILABLE,
        undefined,
        safeMetadata,
      );
    }
    if (code === "rate_limit_exceeded") {
      throw new AIProviderError(
        "OpenAI rate limit reached.",
        ErrorCode.AI_RATE_LIMITED,
        undefined,
        safeMetadata,
      );
    }
    if (code === "timeout" || code === "request_timeout" || code === "vector_store_timeout") {
      throw new AIProviderError(
        "OpenAI request timed out.",
        ErrorCode.AI_TIMEOUT,
        undefined,
        safeMetadata,
      );
    }
    if (code === "server_error") {
      throw new AIProviderError(
        "OpenAI server error.",
        ErrorCode.AI_PROVIDER_UNAVAILABLE,
        undefined,
        safeMetadata,
      );
    }
    throw new AIProviderError(
      "OpenAI response failed.",
      ErrorCode.AI_ERROR,
      undefined,
      safeMetadata,
    );
  }

  if (response.status && response.status !== "completed") {
    throw new AIProviderError(
      "OpenAI returned a non-completed response.",
      ErrorCode.AI_RESPONSE_INVALID,
      undefined,
      safeMetadata,
    );
  }
}

function buildResponseInput(inputs: AIInput[]): Array<{
  role: "user";
  content: Array<
    | { type: "input_text"; text: string }
    | { type: "input_image"; image_url: string; detail: "auto" }
  >;
}> {
  const content = inputs.map((input) => {
    if ("base64" in input) {
      return {
        type: "input_image" as const,
        image_url: toDataUrl(input),
        detail: "auto" as const,
      };
    }

    return {
      type: "input_text" as const,
      text: input.text,
    };
  });

  return [
    {
      role: "user" as const,
      content,
    },
  ];
}

function mergeSignals(signals: Array<AbortSignalLike | undefined>): AbortSignalLike | undefined {
  const active = signals.filter((signal): signal is AbortSignalLike => Boolean(signal));
  if (active.length === 0) {
    return undefined;
  }

  if (active.length === 1) {
    return active[0];
  }

  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { once: true },
    );
  }

  return controller.signal;
}

function createTimeoutSignal(
  timeoutMs: number,
  parentSignal?: AbortSignalLike,
  onTimeout?: () => void,
): {
  signal?: AbortSignalLike;
  dispose: () => void;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { signal: parentSignal, dispose: () => undefined };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    onTimeout?.();
    controller.abort(new Error("Request timed out"));
  }, timeoutMs);

  const merged = mergeSignals([parentSignal, controller.signal]);
  return {
    signal: merged,
    dispose: () => {
      clearTimeout(timeoutId);
    },
  };
}

function withHardDeadline<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return operation;
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AIProviderError("OpenAI request timed out.", ErrorCode.AI_TIMEOUT));
    }, timeoutMs);

    void operation.then(
      (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

export class OpenAIProvider implements AIProvider {
  readonly providerName = "openai";
  readonly defaultModel: string;

  constructor(
    private readonly client: OpenAIResponsesClientLike,
    defaultModel: string,
  ) {
    this.defaultModel = defaultModel;
  }

  async invoke(inputs: AIInput[], options: AIInvocationOptions): Promise<AIInvocationResult> {
    const startedAt = Date.now();
    const requestSummary = summarizeRequestBody(inputs, options.model, options.maxTokens ?? 8192, options.responseFormat);
    const { signal, dispose } = createTimeoutSignal(options.timeoutMs, options.signal, () => {
      logEvent("openai_request_timeout", {
        provider: this.providerName,
        model: options.model,
        timeoutMs: options.timeoutMs,
        request: requestSummary,
      });
    });

    logEvent("openai_request_started", {
      provider: this.providerName,
      ...requestSummary,
    });

    try {
      const request = this.client.responses.create(
        {
          model: options.model,
          input: buildResponseInput(inputs),
          temperature: options.temperature,
          max_output_tokens: options.maxTokens ?? 8192,
          text: buildTextFormat(options.responseFormat),
        },
        { signal: signal as AbortSignal | undefined, timeout: options.timeoutMs },
      );
      const response = await withHardDeadline(request, options.timeoutMs);
      assertCompletedResponse(response);

      const rawText = response.output_text?.trim() ?? "";
      if (!rawText) {
        throw new AIProviderError(
          "OpenAI returned an empty structured response.",
          ErrorCode.AI_RESPONSE_INVALID,
          undefined,
          { providerRequestId: response.id, reachedProvider: true },
        );
      }

      const inputTokens = response.usage?.input_tokens ?? 0;
      const outputTokens = response.usage?.output_tokens ?? 0;

      logEvent("openai_response_received", {
        provider: this.providerName,
        model: response.model,
        latencyMs: Date.now() - startedAt,
        providerRequestId: response.id,
        outputLength: rawText.length,
        inputTokens,
        outputTokens,
      });

      return {
        rawText,
        inputTokens,
        outputTokens,
        totalTokens: response.usage?.total_tokens ?? inputTokens + outputTokens,
        latencyMs: Date.now() - startedAt,
        model: response.model,
        provider: this.providerName,
        providerRequestId: response.id,
        usageSource: response.usage ? "provider_reported" : "estimated",
      };
    } catch (error) {
      const mapped = error instanceof AIProviderError ? error : mapOpenAIError(error);
      const safeFields = extractSafeOpenAIErrorFields(mapped);

      logError("openai_request_failed", mapped, {
        provider: this.providerName,
        model: options.model,
        failureCode: mapped.errorCode,
        request: requestSummary,
        ...safeFields,
      });

      throw mapped;
    } finally {
      dispose();
    }
  }
}

export function createOpenAIProvider(apiKey: string, defaultModel: string, maxRetries = 0): OpenAIProvider {
  const client = new OpenAI({ apiKey: apiKey.trim(), maxRetries });
  return new OpenAIProvider(client as unknown as OpenAIResponsesClientLike, defaultModel);
}
