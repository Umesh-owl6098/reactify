import { z } from "zod";

export const AIResponseEnvelopeSchema = z.object({
  schemaVersion: z.string(),
  responseVersion: z.string(),
});

export type AIResponseEnvelope = z.infer<typeof AIResponseEnvelopeSchema>;
