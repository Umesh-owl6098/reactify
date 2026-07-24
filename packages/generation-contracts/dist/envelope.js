import { z } from "zod";
export const AIResponseEnvelopeSchema = z.object({
    schemaVersion: z.string(),
    responseVersion: z.string(),
});
//# sourceMappingURL=envelope.js.map