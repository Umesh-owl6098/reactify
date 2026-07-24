import { describe, expect, it } from "vitest";
import { createUnifiedDiff } from "./formatUnifiedDiff";

describe("createUnifiedDiff", () => {
  it("renders added and removed lines", () => {
    const { diff } = createUnifiedDiff("line one", "line two", "src/App.tsx", 50);
    expect(diff).toContain("-line one");
    expect(diff).toContain("+line two");
  });

  it("truncates very large diffs", () => {
    const before = Array.from({ length: 300 }, (_, index) => `before-${index}`).join("\n");
    const after = Array.from({ length: 300 }, (_, index) => `after-${index}`).join("\n");
    const { truncated } = createUnifiedDiff(before, after, "src/App.tsx", 20);
    expect(truncated).toBe(true);
  });
});
