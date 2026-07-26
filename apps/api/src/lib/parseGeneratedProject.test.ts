import { describe, expect, it } from "vitest";
import {
  createGeneratedProjectFixtureJson,
  generatedProjectFixture,
  generationPlanFixture,
} from "@reactify/test-utils";
import { ErrorCode } from "@reactify/shared";
import { parseGeneratedProjectResponseDetailed } from "./parseGeneratedProject.js";

describe("parseGeneratedProjectResponseDetailed", () => {
  it("parses a valid generated project", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson(),
      generationPlanFixture,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.generatedProject.projectName).toBe(generatedProjectFixture.projectName);
    }
  });

  it("parses markdown-fenced JSON", () => {
    const json = createGeneratedProjectFixtureJson();
    const result = parseGeneratedProjectResponseDetailed(`\`\`\`json\n${json}\n\`\`\``, generationPlanFixture);
    expect(result.ok).toBe(true);
  });

  it("returns PROVIDER_RESPONSE_NOT_JSON for malformed JSON", () => {
    const result = parseGeneratedProjectResponseDetailed("{bad", generationPlanFixture);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.PROVIDER_RESPONSE_NOT_JSON);
    }
  });

  it("returns GENERATED_PROJECT_TOKEN_TRUNCATED for truncated JSON", () => {
    const result = parseGeneratedProjectResponseDetailed('{"schemaVersion":"1","files":[', generationPlanFixture);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_TOKEN_TRUNCATED);
    }
  });

  it("returns AI_RESPONSE_VERSION_MISSING when responseVersion is absent", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({ responseVersion: undefined }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
    }
  });

  it("returns GENERATED_PROJECT_SCHEMA_INVALID for missing required field", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({ projectName: undefined }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID);
      expect(result.validationIssues.length).toBeGreaterThan(0);
    }
  });

  it("normalizes dependency values to strings", () => {
    const payload = JSON.parse(createGeneratedProjectFixtureJson()) as Record<string, unknown>;
    payload.dependencies = {
      react: Number("18.3.1"),
      "react-dom": Number("18.3.1"),
    };
    const result = parseGeneratedProjectResponseDetailed(JSON.stringify(payload));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizationApplied).toContain("dependency_values_stringified");
    }
  });

  it("converts files object map to array", () => {
    const payload = JSON.parse(createGeneratedProjectFixtureJson()) as Record<string, unknown>;
    payload.files = {
      "src/App.tsx": "export default function App() { return null; }",
    };
    const result = parseGeneratedProjectResponseDetailed(JSON.stringify(payload), generationPlanFixture);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.normalizationApplied).toContain("files_map_to_array");
    }
  });

  it("removes duplicate file entries during normalization", () => {
    const appFile = generatedProjectFixture.files.find((file) => file.path === "src/App.tsx")!;
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({
        files: generatedProjectFixture.files.concat(appFile),
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalizationApplied).toContain("duplicate_file_paths_removed");
    }
  });

  it("returns GENERATED_PROJECT_UNSAFE_PATH for traversal paths", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({
        files: [{ ...generatedProjectFixture.files[0]!, path: "../secret.ts" }],
      }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_SCHEMA_INVALID);
    }
  });

  it("returns UNSAFE_DEPENDENCY for invalid dependency value package", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({
        dependencies: { "left-pad": "1.0.0", react: "^18.3.1", "react-dom": "^18.3.1" },
      }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.UNSAFE_DEPENDENCY);
    }
  });

  it("returns GENERATED_PROJECT_MISSING_REQUIRED_FILES when scaffold files are missing", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({
        files: generatedProjectFixture.files.filter((file) => file.path !== "vite.config.ts"),
      }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.GENERATED_PROJECT_MISSING_REQUIRED_FILES);
    }
  });

  it("returns PLAN_PROJECT_MISMATCH when planned files are missing", () => {
    const result = parseGeneratedProjectResponseDetailed(
      createGeneratedProjectFixtureJson({
        files: generatedProjectFixture.files.filter((file) => file.path !== "src/components/HeroSection.tsx"),
      }),
      generationPlanFixture,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.PLAN_PROJECT_MISMATCH);
    }
  });
});
