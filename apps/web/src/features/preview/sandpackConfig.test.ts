import { describe, expect, it } from "vitest";
import { getSandpackBundlerUrl, DEFAULT_SANDPACK_BUNDLER_URL } from "./sandpackConfig";

describe("sandpackConfig", () => {
  it("uses the default bundler when env override is absent", () => {
    expect(getSandpackBundlerUrl()).toBe(DEFAULT_SANDPACK_BUNDLER_URL);
  });
});
