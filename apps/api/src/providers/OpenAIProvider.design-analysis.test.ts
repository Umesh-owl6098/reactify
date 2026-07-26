import { describe, expect, it } from "vitest";
import { parseDesignAnalysisResponse } from "../lib/parseDesignAnalysis.js";
import { designAnalysisFixture } from "@reactify/test-utils";
import { OpenAIProvider, type OpenAIResponsesClientLike } from "./OpenAIProvider.js";
import { vi } from "vitest";

describe("OpenAIProvider design analysis parsing", () => {
  it("accepts valid DesignAnalysisV1 JSON from provider output", async () => {
    const validJson = JSON.stringify(designAnalysisFixture);
    const client: OpenAIResponsesClientLike = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: "resp_valid",
          model: "gpt-4o",
          output_text: validJson,
          usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
        }),
      },
    };
    const provider = new OpenAIProvider(client, "gpt-4o");
    const result = await provider.invoke([{ text: "prompt" }], {
      promptVersion: "1.0.0",
      model: "gpt-4o",
      temperature: 0.2,
      timeoutMs: 1000,
    });
    const parsed = parseDesignAnalysisResponse(result.rawText);
    expect(parsed.ok).toBe(true);
  });

  it("surfaces malformed JSON through downstream schema validation", () => {
    const parsed = parseDesignAnalysisResponse("not-json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe("ANALYSIS_SCHEMA_INVALID");
    }
  });

  it("surfaces invalid DesignAnalysisV1 through downstream schema validation", () => {
    const parsed = parseDesignAnalysisResponse(JSON.stringify({ schemaVersion: "1", responseVersion: "x" }));
    expect(parsed.ok).toBe(false);
  });
});
