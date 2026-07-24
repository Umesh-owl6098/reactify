import { z } from "zod";
export declare const AIResponseEnvelopeSchema: z.ZodObject<{
    schemaVersion: z.ZodString;
    responseVersion: z.ZodString;
}, "strip", z.ZodTypeAny, {
    schemaVersion: string;
    responseVersion: string;
}, {
    schemaVersion: string;
    responseVersion: string;
}>;
export type AIResponseEnvelope = z.infer<typeof AIResponseEnvelopeSchema>;
//# sourceMappingURL=envelope.d.ts.map