import { describe, expect, it } from "vitest";
import { buildExportFilename, sanitizeProjectName } from "./exportUtils.js";

describe("sanitizeProjectName", () => {
  it("sanitizes normal names", () => {
    expect(sanitizeProjectName("Landing Page", "Fallback")).toBe("landing-page");
    expect(sanitizeProjectName("MY-APP", "fallback")).toBe("my-app");
  });

  it("rejects traversal and slashes", () => {
    expect(sanitizeProjectName("../secret", "fallback")).toBe("secret");
    expect(sanitizeProjectName("bad/name", "fallback")).toBe("bad-name");
    expect(sanitizeProjectName("bad\\name", "fallback")).toBe("bad-name");
  });

  it("handles empty and reserved names", () => {
    expect(sanitizeProjectName("", "")).toBe("reactify-export");
    expect(sanitizeProjectName("node_modules", "fallback")).toBe("reactify-export");
    expect(sanitizeProjectName("CON", "fallback")).toBe("reactify-export");
  });

  it("handles symbols and unicode input", () => {
    expect(sanitizeProjectName("Café App!", "fallback")).toBe("cafe-app");
    expect(sanitizeProjectName("app@#$%", "fallback")).toBe("app");
  });

  it("truncates excessively long names", () => {
    const longName = "a".repeat(100);
    expect(sanitizeProjectName(longName, "fallback").length).toBeLessThanOrEqual(64);
  });

  it("is deterministic", () => {
    expect(sanitizeProjectName("My App", "x")).toBe(sanitizeProjectName("My App", "y"));
  });
});

describe("buildExportFilename", () => {
  it("builds versioned zip filename", () => {
    expect(buildExportFilename("landing-page", 2)).toBe("landing-page-v2.zip");
  });
});
