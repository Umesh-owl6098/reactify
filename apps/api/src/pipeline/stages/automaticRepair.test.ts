import { describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@reactify/shared";
import {
  MockAIProvider,
  createProjectPatchFixtureJson,
  generatedProjectFixture,
  generationPlanFixture,
  designAnalysisFixture,
  projectPatchFixture,
} from "@reactify/test-utils";
import { AIProviderError } from "../../providers/AnthropicProvider.js";
import { computeProjectHash } from "../../lib/projectHash.js";
import { defaultLoadPrompt } from "../../prompts/loader.js";
import { automaticRepairStage } from "./automaticRepair.js";
import type { PipelineContext } from "@reactify/shared";
import { DEFAULT_FEATURE_FLAGS } from "@reactify/shared";
import { testEnv } from "../../test/helpers.js";
import type { PipelineState } from "../types.js";

function createContext(provider: MockAIProvider, overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    generationId: "550e8400-e29b-41d4-a716-446655440000",
    projectId: "660e8400-e29b-41d4-a716-446655440000",
    imageId: "770e8400-e29b-41d4-a716-446655440000",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    flags: DEFAULT_FEATURE_FLAGS,
    aiProvider: provider,
    loadPrompt: defaultLoadPrompt,
    aiConfig: {
      model: testEnv.ANTHROPIC_MODEL,
      temperature: testEnv.AI_TEMPERATURE,
      maxTokens: testEnv.AI_MAX_TOKENS,
      timeoutMs: testEnv.AI_TIMEOUT_MS,
    },
    repairConfig: {
      maxAttempts: testEnv.MAX_REPAIR_ATTEMPTS,
      maxPatchFileBytes: testEnv.MAX_PATCH_FILE_BYTES,
      maxPatchTotalBytes: testEnv.MAX_PATCH_TOTAL_BYTES,
    },
    ...overrides,
  };
}

function createFailedSandboxState(overrides: Partial<PipelineState> = {}): PipelineState {
  const projectHash = computeProjectHash(generatedProjectFixture);
  return {
    imageId: "770e8400-e29b-41d4-a716-446655440000",
    generatedProject: generatedProjectFixture,
    generationPlan: generationPlanFixture,
    designAnalysis: designAnalysisFixture,
    projectHash,
    sandboxValidation: {
      projectHash,
      compilation: {
        success: false,
        durationMs: 10,
        errors: [
          {
            code: "SYNTAX",
            message: "Unexpected token in JSX",
            severity: "error",
            source: "sandpack",
            category: "syntax",
            filePath: "src/App.tsx",
          },
        ],
        warnings: [],
      },
      runtime: {
        success: false,
        durationMs: 0,
        errors: [],
        warnings: [],
      },
      validatedAt: new Date().toISOString(),
    },
    repairAttempts: [],
    ...overrides,
  };
}

describe("automaticRepairStage", () => {
  it("skips repair when sandbox validation succeeded", async () => {
    const projectHash = computeProjectHash(generatedProjectFixture);
    const result = await automaticRepairStage(
      {
        imageId: "770e8400-e29b-41d4-a716-446655440000",
        generatedProject: generatedProjectFixture,
        sandboxValidation: {
          projectHash,
          compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
          runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
          validatedAt: new Date().toISOString(),
        },
      },
      createContext(new MockAIProvider()),
    );

    expect(result.status).toBe("completed");
    expect(result.output).toMatchObject({ repairRequired: false, repairStatus: "succeeded" });
  });

  it("applies a valid first-attempt repair and pauses for revalidation", async () => {
    const provider = new MockAIProvider({ rawText: createProjectPatchFixtureJson() });
    const context = createContext(provider);
    const state = createFailedSandboxState();

    const result = await automaticRepairStage(state, context);

    expect(result.status).toBe("paused");
    expect(result.output).toMatchObject({
      repairStatus: "waiting_for_revalidation",
      awaitingSandboxValidation: true,
      currentRepairAttempt: 1,
    });
    expect(provider.invocations).toHaveLength(1);
    expect(provider.invocations[0]?.inputs.some((input) => "text" in input && input.text.includes("Approved dependency allowlist"))).toBe(true);
    expect(provider.invocations[0]?.inputs.some((input) => "text" in input && input.text.includes("Previous repair attempts"))).toBe(true);
    expect(JSON.stringify(result.output)).not.toContain("You are repairing a generated React");
  });

  it("fails on malformed AI JSON", async () => {
    const provider = new MockAIProvider({ rawText: "not-json" });
    const result = await automaticRepairStage(createFailedSandboxState(), createContext(provider));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.PATCH_SCHEMA_INVALID);
  });

  it("fails on invalid patch schema", async () => {
    const provider = new MockAIProvider({
      rawText: JSON.stringify({ schemaVersion: "1", responseVersion: "bad" }),
    });
    const result = await automaticRepairStage(createFailedSandboxState(), createContext(provider));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.PATCH_SCHEMA_INVALID);
  });

  it("fails on provider timeout with manual retry allowed", async () => {
    const provider = new MockAIProvider({
      error: new AIProviderError("Timed out", ErrorCode.AI_TIMEOUT),
    });
    const result = await automaticRepairStage(createFailedSandboxState(), createContext(provider));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.AI_TIMEOUT);
    expect(result.output).toMatchObject({ manualRetryAllowed: true });
  });

  it("fails on unsafe patch content", async () => {
    const provider = new MockAIProvider({
      rawText: createProjectPatchFixtureJson({
        changedFiles: [
          {
            path: "src/App.tsx",
            fullContent: "eval('bad')",
            language: "tsx",
            reason: "bad",
          },
        ],
      }),
    });
    const result = await automaticRepairStage(createFailedSandboxState(), createContext(provider));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.PATCH_SECURITY_VIOLATION);
  });

  it("detects repeated patch output", async () => {
    const provider = new MockAIProvider({ rawText: createProjectPatchFixtureJson() });
    const state = createFailedSandboxState({
      repairAttempts: [
        {
          attemptNumber: 1,
          startedAt: new Date().toISOString(),
          status: "failed",
          provider: "mock",
          model: "mock-model-v1",
          promptVersion: "1.0.0",
          inputTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
          diagnosticsBefore: [],
          repairabilityClassification: { repairable: true, reasons: ["Syntax error"] },
          changedFiles: [],
          deletedFiles: [],
          dependencyChanges: [],
          projectHashBefore: computeProjectHash(generatedProjectFixture),
          repeatedPatchDetected: false,
          repeatedDiagnosticsDetected: false,
          unresolvedRisks: [],
          patchFingerprint: JSON.stringify({
            changedFiles: projectPatchFixture.changedFiles.map((file) => ({
              path: file.path,
              fullContent: file.fullContent,
            })),
            deletedFiles: [],
            dependencyChanges: [],
          }),
        },
      ],
    });

    const result = await automaticRepairStage(state, createContext(provider));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.REPEATED_PATCH);
  });

  it("returns repair not possible without a generated project", async () => {
    const result = await automaticRepairStage({ imageId: "770e8400-e29b-41d4-a716-446655440000" }, createContext(new MockAIProvider()));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.REPAIR_NOT_POSSIBLE);
  });

  it("returns exhausted attempts when limit reached", async () => {
    const state = createFailedSandboxState({ repairAttempts: [{ attemptNumber: 1 } as never, { attemptNumber: 2 } as never, { attemptNumber: 3 } as never] });
    const result = await automaticRepairStage(state, createContext(new MockAIProvider()));
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe(ErrorCode.REPAIR_ATTEMPTS_EXHAUSTED);
  });
});
