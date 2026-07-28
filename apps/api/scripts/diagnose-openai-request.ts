/**
 * Safe OpenAI request diagnostic. Never prints API keys, prompts, or image data.
 */
import { validateEnv } from "../src/env.js";
import { resolveConfiguredAIModels, resolveOperationAIConfig } from "../src/providers/ai-provider-config.js";
import OpenAI, { APIError } from "openai";

function safeErrorFields(error: unknown) {
  if (error instanceof APIError) {
    return {
      httpStatus: error.status,
      errorType: error.type,
      errorCode: error.code,
      message: error.message,
      requestId: error.requestID,
      reachedOpenAI: true,
    };
  }

  return {
    httpStatus: undefined,
    errorType: error instanceof Error ? error.name : typeof error,
    errorCode: undefined,
    message: error instanceof Error ? error.message : String(error),
    requestId: undefined,
    reachedOpenAI: false,
  };
}

async function main() {
  const env = validateEnv();
  const model = resolveOperationAIConfig(env, "design_analysis").model;
  const keyPresent = Boolean(env.OPENAI_API_KEY?.trim());
  const keyLength = env.OPENAI_API_KEY?.trim().length ?? 0;
  const keyHasSurroundingQuotes =
    Boolean(env.OPENAI_API_KEY?.startsWith("\"") || env.OPENAI_API_KEY?.startsWith("'"));

  console.log({
    aiProvider: env.AI_PROVIDER,
    model,
    keyPresent,
    keyLength,
    keyHasSurroundingQuotes,
    configuredModels: resolveConfiguredAIModels(env),
  });

  if (env.AI_PROVIDER !== "openai" || !keyPresent) {
    console.log("Skipping live OpenAI probe because openai provider/key is not configured.");
    return;
  }

  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY!.trim() });
  const tinyPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

  const attempts = [
    {
      label: "flat_input_items",
      body: {
        model,
        input: [
          { type: "input_text" as const, text: "Return JSON with keys schemaVersion and responseVersion only." },
          {
            type: "input_image" as const,
            image_url: `data:image/png;base64,${tinyPngBase64}`,
            detail: "auto" as const,
          },
        ],
        text: { format: { type: "json_object" as const } },
        max_output_tokens: 256,
      },
    },
    {
      label: "user_message_content",
      body: {
        model,
        input: [
          {
            role: "user" as const,
            content: [
              { type: "input_text" as const, text: "Return JSON with keys schemaVersion and responseVersion only." },
              {
                type: "input_image" as const,
                image_url: `data:image/png;base64,${tinyPngBase64}`,
                detail: "auto" as const,
              },
            ],
          },
        ],
        text: { format: { type: "json_object" as const } },
        max_output_tokens: 256,
      },
    },
  ];

  for (const attempt of attempts) {
    try {
      const response = await client.responses.create(attempt.body as never);
      console.log({
        attempt: attempt.label,
        ok: true,
        requestId: response.id,
        outputLength: response.output_text?.length ?? 0,
        model: response.model,
      });
    } catch (error) {
      console.log({
        attempt: attempt.label,
        ok: false,
        ...safeErrorFields(error),
      });
    }
  }
}

main().catch((error) => {
  console.error(safeErrorFields(error));
  process.exit(1);
});
