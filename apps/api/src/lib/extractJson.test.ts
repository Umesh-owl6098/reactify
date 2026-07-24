import { describe, expect, it } from "vitest";
import { extractJsonFromModelText } from "./extractJson.js";

describe("extractJsonFromModelText", () => {
  it("returns trimmed raw text when no fences are present", () => {
    expect(extractJsonFromModelText('  {"ok":true}  ')).toBe('{"ok":true}');
  });

  it("removes outer json markdown fences", () => {
    expect(extractJsonFromModelText('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });

  it("removes outer generic markdown fences", () => {
    expect(extractJsonFromModelText('```\n{"ok":true}\n```')).toBe('{"ok":true}');
  });
});
