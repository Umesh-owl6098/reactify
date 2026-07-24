import { describe, expect, it } from "vitest";
describe("@reactify/ui", () => {
    it("exports a Button component module", async () => {
        const ui = await import("./index.js");
        expect(ui.Button).toBeTypeOf("function");
    });
});
//# sourceMappingURL=index.test.js.map