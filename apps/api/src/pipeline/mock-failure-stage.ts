import type { PipelineStageName } from "@reactify/generation-contracts";
import { PIPELINE_STAGE_ORDER } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";

export function resolveMockFailureStage(
  raw: string | undefined,
  nodeEnv: string = process.env.NODE_ENV ?? "development",
): PipelineStageName | undefined {
  if (nodeEnv !== "test" || !raw?.trim()) {
    return undefined;
  }

  const stage = raw.trim() as PipelineStageName;
  return PIPELINE_STAGE_ORDER.includes(stage) ? stage : undefined;
}

export function createMockFailureMessage(stage: PipelineStageName): string {
  return `Forced failure at ${stage}`;
}

export function isLegacyForcedFailureError(code: string, message: string): boolean {
  return code === ErrorCode.INTERNAL_ERROR && message.startsWith("Forced failure at ");
}
