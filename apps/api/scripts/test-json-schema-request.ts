import OpenAI from "openai";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { validateEnv } from "../src/env.js";
import { resolveActiveModel } from "../src/providers/ai-provider-config.js";
import { GENERATED_PROJECT_V1_JSON_SCHEMA } from "../src/lib/generated-project-json-schema.js";
import { extractSafeOpenAIErrorFields } from "../src/providers/openai-error-utils.js";

loadLocalEnv();
const env = validateEnv();
const model = resolveActiveModel(env);
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY!.trim() });

try {
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: "Return minimal valid generated project JSON for a sign-in form." }],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "generated_project_v1",
        schema: GENERATED_PROJECT_V1_JSON_SCHEMA,
        strict: true,
      },
    },
    max_output_tokens: 256,
  });
  console.log({ ok: true, outputLength: response.output_text?.length ?? 0 });
} catch (error) {
  console.log({ ok: false, ...extractSafeOpenAIErrorFields(error as never) });
}
