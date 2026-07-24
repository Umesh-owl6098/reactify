import { describe, expect, it } from "vitest";
import { validateProjectFilePath } from "./filePathValidator.js";

describe("validateProjectFilePath", () => {
  it("accepts project-relative paths", () => {
    expect(validateProjectFilePath("src/App.tsx").ok).toBe(true);
  });

  it("rejects absolute paths", () => {
    const result = validateProjectFilePath("/etc/passwd");
    expect(result.ok).toBe(false);
  });

  it("rejects traversal paths", () => {
    const result = validateProjectFilePath("../secret.ts");
    expect(result.ok).toBe(false);
  });

  it("rejects node_modules paths", () => {
    const result = validateProjectFilePath("node_modules/react/index.js");
    expect(result.ok).toBe(false);
  });
});
