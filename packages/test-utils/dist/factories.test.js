import { describe, expect, it } from "vitest";
import { createTestEnvelope } from "./factories.js";
describe("createTestEnvelope", () => {
    it("returns a valid AI response envelope", () => {
        const envelope = createTestEnvelope();
        expect(envelope.schemaVersion).toBe("1");
        expect(envelope.responseVersion).toBe("test");
    });
});
//# sourceMappingURL=factories.test.js.map