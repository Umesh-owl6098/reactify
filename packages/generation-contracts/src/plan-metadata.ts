import { z } from "zod";

export const PlanMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  schemaVersion: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  temperature: z.number(),
  generatedAt: z.string().datetime(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;
