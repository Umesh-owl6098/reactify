import { describe, expect, it } from "vitest";
import { generatedProjectFixture } from "@reactify/test-utils";
import { buildExportManifest, prepareProjectFiles } from "./exportPackageBuilder.js";

describe("export manifest", () => {
  it("builds deterministic sorted manifest entries", () => {
    const prepared = prepareProjectFiles(generatedProjectFixture, {
      maxFiles: 200,
      maxFileBytes: 1024 * 1024,
      maxTotalBytes: 5 * 1024 * 1024,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }

    const manifest = buildExportManifest({
      exportId: "550e8400-e29b-41d4-a716-446655440000",
      generationId: "660e8400-e29b-41d4-a716-446655440000",
      versionId: "hash-1",
      versionNumber: 1,
      projectName: "mock-landing-page",
      projectHash: "hash-1",
      exportedAt: new Date().toISOString(),
      files: prepared.package.files,
      totalSizeBytes: prepared.package.totalSizeBytes,
      dependencies: generatedProjectFixture.dependencies,
      devDependencies: generatedProjectFixture.devDependencies ?? {},
    });

    expect(manifest.schemaVersion).toBe("1");
    expect(manifest.files.map((file) => file.path)).toEqual(
      [...manifest.files.map((file) => file.path)].sort(),
    );
    expect(manifest.dependencies.react).toBe("^18.3.1");
  });
});
