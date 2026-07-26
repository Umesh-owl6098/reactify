import { describe, expect, it } from "vitest";
import { resolveRedirectPath } from "./redirect.js";

describe("resolveRedirectPath", () => {
  it("returns home when redirect state is missing", () => {
    expect(resolveRedirectPath(undefined)).toBe("/");
    expect(resolveRedirectPath(null)).toBe("/");
  });

  it("preserves string redirect paths", () => {
    expect(resolveRedirectPath({ from: "/generations/abc" })).toBe("/generations/abc");
  });

  it("preserves pathname, search, and hash from location objects", () => {
    expect(
      resolveRedirectPath({
        from: {
          pathname: "/generations/49189210-714d-431d-ac1c-1554c8cf4c74",
          search: "?tab=jobs",
          hash: "#details",
        },
      }),
    ).toBe("/generations/49189210-714d-431d-ac1c-1554c8cf4c74?tab=jobs#details");
  });
});
