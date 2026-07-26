import { describe, expect, it } from "vitest";
import { generationDetailPath, isGenerationStatusForRoute } from "./generation-route";

describe("generation-route", () => {
  it("builds encoded generation detail paths", () => {
    expect(generationDetailPath("49189210-714d-431d-ac1c-1554c8cf4c74")).toBe(
      "/generations/49189210-714d-431d-ac1c-1554c8cf4c74",
    );
  });

  it("matches status to the active route generation id", () => {
    expect(
      isGenerationStatusForRoute({ id: "49189210-714d-431d-ac1c-1554c8cf4c74" }, "49189210-714d-431d-ac1c-1554c8cf4c74"),
    ).toBe(true);
    expect(
      isGenerationStatusForRoute({ id: "11111111-1111-4111-8111-111111111111" }, "49189210-714d-431d-ac1c-1554c8cf4c74"),
    ).toBe(false);
  });
});
