import { describe, expect, it } from "vitest";
import {
  DesignAnalysisV1Schema,
  GeneratedProjectV1Schema,
  GenerationPlanV1Schema,
} from "@reactify/generation-contracts";
import { MockAIProvider } from "./MockAIProvider.js";

const options = {
  promptVersion: "test",
  model: "mock-model-v1",
  temperature: 0,
  maxTokens: 1_000,
  timeoutMs: 1_000,
};

async function invoke(provider: MockAIProvider, prompt: string): Promise<string> {
  return (await provider.invoke([{ text: prompt }], options)).rawText;
}

describe("MockAIProvider", () => {
  it("selects schema-valid fixtures by stage rather than shared invocation order", async () => {
    const provider = new MockAIProvider();

    const projectFirst = await invoke(provider, "React + TypeScript + Vite + Tailwind");
    const analysisAfterRetry = await invoke(provider, "screenshot-to-code pipeline DesignAnalysisV1 structure");
    const planLast = await invoke(provider, "frontend architect planning GenerationPlanV1 structure");

    expect(() => GeneratedProjectV1Schema.parse(JSON.parse(projectFirst))).not.toThrow();
    expect(() => DesignAnalysisV1Schema.parse(JSON.parse(analysisAfterRetry))).not.toThrow();
    expect(() => GenerationPlanV1Schema.parse(JSON.parse(planLast))).not.toThrow();
  });

  it("includes every supported visual object kind in the analysis fixture", async () => {
    const provider = new MockAIProvider();
    const rawText = await invoke(provider, "screenshot-to-code pipeline DesignAnalysisV1 structure");
    const analysis = DesignAnalysisV1Schema.parse(JSON.parse(rawText));

    expect(new Set(analysis.visualComposition?.objects.map((object) => object.kind))).toEqual(
      new Set([
        "chart",
        "illustration",
        "text",
        "control",
        "surface",
        "background",
        "device",
        "tool",
        "decoration",
      ]),
    );
  });
});
