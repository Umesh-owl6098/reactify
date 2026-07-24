import { AIResponseEnvelopeSchema } from "@reactify/generation-contracts";
import { APP_VERSION } from "@reactify/shared";

export function createTestEnvelope(overrides: Record<string, string> = {}) {
  return AIResponseEnvelopeSchema.parse({
    schemaVersion: "1",
    responseVersion: "test",
    ...overrides,
  });
}

export function getTestAppVersion() {
  return APP_VERSION;
}
