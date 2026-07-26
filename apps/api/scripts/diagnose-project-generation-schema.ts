/**
 * Replays react_project_generation against OpenAI and prints safe validation diagnostics.
 * Never logs API keys or full file contents.
 */
import { validateEnv } from "../src/env.js";
import { loadLocalEnv } from "../src/lib/load-local-env.js";
import { getPrismaClient } from "../src/persistence/client.js";
import { createAIProvider } from "../src/providers/providerFactory.js";
import { resolveActiveModel } from "../src/providers/ai-provider-config.js";
import { defaultLoadPrompt } from "../src/prompts/loader.js";
import { ALLOWED_DEPENDENCIES } from "../src/lib/allowlist.js";
import { GENERATED_PROJECT_V1_JSON_SCHEMA } from "../src/lib/generated-project-json-schema.js";
import { parseGeneratedProjectResponseDetailed } from "../src/lib/parseGeneratedProject.js";

async function main() {
  const generationId = process.argv[2] ?? "d0c9ce60-9630-470e-983e-94cb4b424527";
  loadLocalEnv();
  const env = validateEnv();
  const prisma = getPrismaClient(env);
  const generation = await prisma.generation.findUnique({ where: { id: generationId } });
  if (!generation) {
    throw new Error(`Generation ${generationId} not found`);
  }

  const pipelineState = generation.pipelineState as {
    designAnalysis?: unknown;
    generationPlan?: unknown;
  };

  if (!pipelineState.designAnalysis || !pipelineState.generationPlan) {
    throw new Error("Generation is missing designAnalysis or generationPlan in pipeline state");
  }

  const prompt = defaultLoadPrompt("react-project-generation");
  const provider = createAIProvider(env);
  const model = resolveActiveModel(env);
  const allowlist = JSON.stringify([...ALLOWED_DEPENDENCIES].sort());

  const invocation = await provider.invoke(
    [
      { text: prompt.content },
      { text: `Approved dependency allowlist:\n${allowlist}` },
      { text: `DesignAnalysisV1 input:\n${JSON.stringify(pipelineState.designAnalysis)}` },
      { text: `Confirmed GenerationPlanV1 input:\n${JSON.stringify(pipelineState.generationPlan)}` },
    ],
    {
      promptVersion: prompt.meta.promptVersion,
      model,
      temperature: env.AI_TEMPERATURE,
      maxTokens: env.AI_MAX_TOKENS,
      timeoutMs: Math.max(env.AI_TIMEOUT_MS, 180_000),
      responseFormat: {
        type: "json_schema",
        name: "generated_project_v1",
        schema: GENERATED_PROJECT_V1_JSON_SCHEMA,
        strict: true,
      },
    },
  );

  const detailed = parseGeneratedProjectResponseDetailed(
    invocation.rawText,
    pipelineState.generationPlan as never,
  );

  console.log(
    JSON.stringify(
      {
        generationId,
        model: invocation.model,
        provider: invocation.provider,
        inputTokens: invocation.inputTokens,
        outputTokens: invocation.outputTokens,
        rawLength: invocation.rawText.length,
        rawPreview: invocation.rawText.slice(0, 400),
        rawTail: invocation.rawText.slice(-120),
        parseOk: detailed.ok,
        errorCode: detailed.ok ? null : detailed.errorCode,
        message: detailed.ok ? null : detailed.message,
        validationIssues: detailed.ok ? [] : detailed.validationIssues,
        normalizationApplied: detailed.normalizationApplied,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
