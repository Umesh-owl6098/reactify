import { describe, expect, it } from "vitest";
import { AIResponseEnvelopeSchema } from "./envelope.js";
describe("AIResponseEnvelopeSchema", () => {
    it("accepts a valid envelope", () => {
        const result = AIResponseEnvelopeSchema.safeParse({
            schemaVersion: "1",
            responseVersion: "2025-01-01",
        });
        expect(result.success).toBe(true);
    });
    it("rejects missing fields", () => {
        const result = AIResponseEnvelopeSchema.safeParse({
            schemaVersion: "1",
        });
        expect(result.success).toBe(false);
    });
});
//# sourceMappingURL=envelope.test.js.map