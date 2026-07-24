import type { FastifyInstance } from "fastify";
import { generatedProjectFixture } from "@reactify/test-utils";
import type { SandboxValidationRequest } from "@reactify/generation-contracts";
import { computeProjectHash } from "../lib/projectHash.js";
import type { createPipelineServices } from "../pipeline/index.js";

export function createSuccessfulSandboxValidationReport(input: {
  generationId: string;
  projectHash: string;
}): SandboxValidationRequest {
  return {
    generationId: input.generationId,
    projectHash: input.projectHash,
    compilation: {
      success: true,
      durationMs: 120,
      errors: [],
      warnings: [],
    },
    runtime: {
      success: true,
      durationMs: 240,
      errors: [],
      warnings: [],
    },
    validatedAt: new Date().toISOString(),
  };
}

export function createFailedCompilationSandboxValidationReport(input: {
  generationId: string;
  projectHash: string;
}): SandboxValidationRequest {
  return {
    generationId: input.generationId,
    projectHash: input.projectHash,
    compilation: {
      success: false,
      durationMs: 90,
      errors: [
        {
          code: "SYNTAX_ERROR",
          message: "Unexpected token",
          severity: "error",
          source: "typescript",
          category: "syntax",
          filePath: "src/App.tsx",
          line: 4,
          column: 12,
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
  };
}

export function createFailedRuntimeSandboxValidationReport(input: {
  generationId: string;
  projectHash: string;
}): SandboxValidationRequest {
  return {
    generationId: input.generationId,
    projectHash: input.projectHash,
    compilation: {
      success: true,
      durationMs: 120,
      errors: [],
      warnings: [],
    },
    runtime: {
      success: false,
      durationMs: 180,
      errors: [
        {
          code: "RUNTIME_ERROR",
          message: "ReferenceError: missingValue is not defined",
          severity: "error",
          source: "runtime",
          category: "runtime-error",
        },
      ],
      warnings: [],
    },
    validatedAt: new Date().toISOString(),
  };
}

export async function waitForAwaitingSandboxValidation(
  getStatus: () => Promise<{ awaitingSandboxValidation?: boolean; projectHash?: string | null }>,
  timeoutMs = 8000,
): Promise<{ projectHash: string }> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const status = await getStatus();
    if (status.awaitingSandboxValidation && status.projectHash) {
      return { projectHash: status.projectHash };
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for sandbox validation pause.");
}

export function getFixtureProjectHash(): string {
  return computeProjectHash(generatedProjectFixture);
}

export async function submitSandboxValidationReport(
  app: FastifyInstance,
  generationId: string,
  report: SandboxValidationRequest,
): Promise<Awaited<ReturnType<FastifyInstance["inject"]>>> {
  return app.inject({
    method: "POST",
    url: `/api/v1/generations/${generationId}/sandbox-validation`,
    payload: report,
  });
}

export async function completeSandboxValidation(
  app: FastifyInstance,
  generationId: string,
  pipeline: ReturnType<typeof createPipelineServices>,
): Promise<void> {
  const { projectHash } = await waitForAwaitingSandboxValidation(async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/v1/generations/${generationId}`,
    });
    return response.json() as { awaitingSandboxValidation?: boolean; projectHash?: string | null };
  });

  const submitResponse = await submitSandboxValidationReport(
    app,
    generationId,
    createSuccessfulSandboxValidationReport({ generationId, projectHash }),
  );

  if (submitResponse.statusCode !== 200) {
    throw new Error(`Sandbox validation submission failed: ${submitResponse.body}`);
  }

  const started = Date.now();
  while (Date.now() - started < 8000) {
    const record = pipeline.store.get(generationId);
    if (record?.status === "Ready" || record?.status === "RepairRequired" || record?.status === "Failed") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("Timed out waiting for sandbox validation resume.");
}
