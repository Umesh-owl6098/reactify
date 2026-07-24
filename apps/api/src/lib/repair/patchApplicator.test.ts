import { describe, expect, it } from "vitest";
import { generatedProjectFixture, projectPatchFixture } from "@reactify/test-utils";
import { applyProjectPatch } from "./patchApplicator.js";

describe("patchApplicator", () => {
  it("applies changed files deterministically", () => {
    const result = applyProjectPatch(generatedProjectFixture, projectPatchFixture);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.changedPaths).toContain("src/App.tsx");
      expect(result.result.projectHash).not.toBe("");
    }
  });

  it("does not mutate the input project", () => {
    const original = structuredClone(generatedProjectFixture);
    applyProjectPatch(generatedProjectFixture, projectPatchFixture);
    expect(generatedProjectFixture).toEqual(original);
  });

  it("adds new files and keeps stable ordering", () => {
    const result = applyProjectPatch(generatedProjectFixture, {
      ...projectPatchFixture,
      changedFiles: [
        ...projectPatchFixture.changedFiles,
        {
          path: "src/components/RepairBadge.tsx",
          fullContent: "export function RepairBadge(){return null}",
          language: "tsx",
          reason: "Add helper",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const paths = result.result.project.files.map((file) => file.path);
      expect(paths).toEqual([...paths].sort());
      expect(paths).toContain("src/components/RepairBadge.tsx");
    }
  });

  it("applies dependency add/update/remove changes", () => {
    const result = applyProjectPatch(generatedProjectFixture, {
      ...projectPatchFixture,
      deletedFiles: [],
      dependencyChanges: [
        {
          packageName: "tailwindcss",
          action: "update",
          targetGroup: "devDependencies",
          version: "^3.4.17",
          reason: "align version",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.project.devDependencies?.tailwindcss).toBe("^3.4.17");
    }
  });

  it("changes hash after real patch content changes", () => {
    const appFile = generatedProjectFixture.files.find((file) => file.path === "src/App.tsx")!;
    const result = applyProjectPatch(generatedProjectFixture, {
      ...projectPatchFixture,
      changedFiles: [
        {
          path: "src/App.tsx",
          fullContent: `${appFile.content}\n// repaired`,
          language: "tsx",
          reason: "fix",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.projectHash).not.toBe("");
    }
  });
});
