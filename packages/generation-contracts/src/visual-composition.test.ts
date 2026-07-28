import { describe, expect, it } from "vitest";
import { DesignAnalysisV1Schema } from "./design-analysis.js";
import { VisualCompositionV1Schema, horizontalRegion, majorObjects } from "./visual-composition.js";

function baseAnalysis(extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: "1",
    responseVersion: "2026-07-25T00:00:00.000Z",
    layoutHierarchy: "single frame",
    componentHierarchy: [],
    colors: [],
    typography: [],
    spacing: [],
    ...extra,
  };
}

describe("DesignAnalysisV1Schema null tolerance", () => {
  it("accepts explicit nulls for optional fields", () => {
    const result = DesignAnalysisV1Schema.safeParse(
      baseAnalysis({
        borders: null,
        shadows: null,
        icons: null,
        imagePlaceholders: null,
        interactions: null,
        responsiveBehavior: null,
        visualComposition: null,
      }),
    );

    expect(result.success).toBe(true);
    expect(result.success && result.data.borders).toBeUndefined();
    expect(result.success && result.data.visualComposition).toBeUndefined();
  });

  it("accepts a null responsive note inside the component hierarchy", () => {
    const result = DesignAnalysisV1Schema.safeParse(
      baseAnalysis({
        componentHierarchy: [
          { id: "root", type: "section", description: "frame", responsive: null, children: null, interactions: null },
        ],
      }),
    );

    expect(result.success).toBe(true);
  });

  it("accepts a null usage note on a colour token", () => {
    const result = DesignAnalysisV1Schema.safeParse(
      baseAnalysis({ colors: [{ name: "brand", hex: "#3c7dbe", usage: null }] }),
    );

    expect(result.success).toBe(true);
  });
});

describe("VisualCompositionV1Schema", () => {
  const object = {
    id: "desktop",
    name: "desktop monitor",
    kind: "device",
    box: { x: 0.4, y: 0.2, width: 0.25, height: 0.5 },
    layer: 2,
    silhouette: "rounded rectangle on a trapezoid stand",
    confidence: 0.9,
  };

  it("fills in defaults for omitted optional detail", () => {
    const result = VisualCompositionV1Schema.parse({
      schemaVersion: "1",
      sourceWidth: 2000,
      sourceHeight: 1111,
      backgroundColor: "#3c7dbe",
      objects: [object],
    });

    expect(result.backgroundFillsFrame).toBe(true);
    expect(result.objects[0]!.rotationDegrees).toBe(0);
    expect(result.objects[0]!.textVisibility).toBe("none");
    expect(result.objects[0]!.text).toBeNull();
    expect(result.objects[0]!.dominantColors).toEqual([]);
  });

  it("clamps boxes and rotations that run slightly out of range", () => {
    const result = VisualCompositionV1Schema.parse({
      schemaVersion: "1",
      sourceWidth: 2000,
      sourceHeight: 1111,
      backgroundColor: "#3c7dbe",
      objects: [{ ...object, box: { x: -0.05, y: 0.2, width: 1.4, height: 0.5 }, rotationDegrees: 210 }],
    });

    expect(result.objects[0]!.box.x).toBe(0);
    expect(result.objects[0]!.box.width).toBe(1);
    expect(result.objects[0]!.rotationDegrees).toBe(180);
  });

  it("drops malformed colour values instead of rejecting the object", () => {
    const result = VisualCompositionV1Schema.parse({
      schemaVersion: "1",
      sourceWidth: 2000,
      sourceHeight: 1111,
      backgroundColor: "#3c7dbe",
      objects: [{ ...object, dominantColors: ["#112233", "rgb(1,2,3)", "blue"] }],
    });

    expect(result.objects[0]!.dominantColors).toEqual(["#112233"]);
  });

  it("accepts chart as a visual object kind", () => {
    const result = VisualCompositionV1Schema.parse({
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
    });

    expect(result.objects[0]!.kind).toBe("chart");
  });
});

describe("composition helpers", () => {
  it("assigns objects to horizontal thirds by their centre", () => {
    expect(horizontalRegion({ x: 0.02, y: 0, width: 0.1, height: 0.1 })).toBe("left");
    expect(horizontalRegion({ x: 0.45, y: 0, width: 0.1, height: 0.1 })).toBe("center");
    expect(horizontalRegion({ x: 0.85, y: 0, width: 0.1, height: 0.1 })).toBe("right");
  });

  it("falls back to area when no major objects are declared", () => {
    const composition = VisualCompositionV1Schema.parse({
      schemaVersion: "1",
      sourceWidth: 2000,
      sourceHeight: 1111,
      backgroundColor: "#3c7dbe",
      objects: [
        {
          id: "big",
          name: "monitor",
          kind: "device",
          box: { x: 0.3, y: 0.2, width: 0.3, height: 0.4 },
          layer: 1,
          silhouette: "rectangle",
          confidence: 0.9,
        },
        {
          id: "speck",
          name: "dot",
          kind: "decoration",
          box: { x: 0.9, y: 0.9, width: 0.005, height: 0.005 },
          layer: 1,
          silhouette: "circle",
          confidence: 0.4,
        },
      ],
    });

    expect(majorObjects(composition).map((entry) => entry.id)).toEqual(["big"]);
  });
});
