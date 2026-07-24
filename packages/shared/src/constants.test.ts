import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./constants.js";

describe("APP_VERSION", () => {
  it("is the foundation release version", () => {
    expect(APP_VERSION).toBe("0.1.0");
  });
});
