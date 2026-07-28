import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { createDesignAnalysisFixtureJson } from "@reactify/test-utils";
import { parseDesignAnalysisResponse } from "./parseDesignAnalysis.js";

describe("parseDesignAnalysisResponse", () => {
  it("parses a valid DesignAnalysisV1 response", () => {
    const result = parseDesignAnalysisResponse(createDesignAnalysisFixtureJson());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.designAnalysis.schemaVersion).toBe("1");
      expect(result.designAnalysis.layoutHierarchy).toContain("Header");
    }
  });

  it("accepts markdown-fenced JSON", () => {
    const result = parseDesignAnalysisResponse(
      `\`\`\`json\n${createDesignAnalysisFixtureJson()}\n\`\`\``,
    );

    expect(result.ok).toBe(true);
  });

  it("returns AI_RESPONSE_VERSION_MISSING when envelope fields are absent", () => {
    const result = parseDesignAnalysisResponse(JSON.stringify({ layoutHierarchy: "Only layout" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.AI_RESPONSE_VERSION_MISSING);
    }
  });

  it("returns ANALYSIS_SCHEMA_INVALID for malformed JSON", () => {
    const result = parseDesignAnalysisResponse("{ not-json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.ANALYSIS_SCHEMA_INVALID);
    }
  });

  it("returns ANALYSIS_SCHEMA_INVALID for invalid DesignAnalysisV1 structure", () => {
    const result = parseDesignAnalysisResponse(
      JSON.stringify({
        schemaVersion: "1",
        responseVersion: "2026-01-01T00:00:00.000Z",
        layoutHierarchy: "Header",
        componentHierarchy: [],
        colors: [{ name: "bad", hex: "not-a-hex" }],
        typography: [],
        spacing: [],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe(ErrorCode.ANALYSIS_SCHEMA_INVALID);
    }
  });

  it("accepts visualComposition objects with kind chart", () => {
    const result = parseDesignAnalysisResponse(
      createDesignAnalysisFixtureJson({
        visualComposition: {
          schemaVersion: "1",
          sourceWidth: 1440,
          sourceHeight: 900,
          backgroundColor: "#ffffff",
          objects: [
            {
              id: "revenue-chart",
              name: "bar chart",
              kind: "chart",
              box: { x: 0.1, y: 0.2, width: 0.35, height: 0.4 },
              layer: 1,
              silhouette: "grouped vertical bars with axis labels",
              confidence: 0.85,
            },
          ],
          majorObjectIds: ["revenue-chart"],
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.designAnalysis.visualComposition?.objects[0]?.kind).toBe("chart");
    }
  });
});
