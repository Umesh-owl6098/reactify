import { describe, expect, it } from "vitest";
import type { GeneratedProjectV1, VisualCompositionV1, VisualObject } from "@reactify/generation-contracts";
import { validateVisualFidelity } from "./visualFidelityValidator.js";

function object(overrides: Partial<VisualObject> & Pick<VisualObject, "id" | "name">): VisualObject {
  return {
    kind: "device",
    box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    layer: 1,
    silhouette: "rounded rectangle",
    rotationDegrees: 0,
    relativeScale: 0.5,
    dominantColors: [],
    subComponents: [],
    textVisibility: "none",
    text: null,
    connectedTo: [],
    responsiveBehavior: null,
    confidence: 0.9,
    ...overrides,
  };
}

function composition(overrides: Partial<VisualCompositionV1> = {}): VisualCompositionV1 {
  return {
    schemaVersion: "1",
    sourceWidth: 2000,
    sourceHeight: 1111,
    backgroundColor: "#2f6df6",
    backgroundFillsFrame: true,
    objects: [],
    majorObjectIds: [],
    notes: null,
    ...overrides,
  };
}

function project(files: Array<{ path: string; content: string }>): GeneratedProjectV1 {
  return {
    schemaVersion: "1",
    responseVersion: "2026-07-25T00:00:00.000Z",
    projectName: "Showcase",
    summary: "Test project",
    dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
    devDependencies: {},
    files: files.map((file) => ({
      path: file.path,
      language: "tsx" as const,
      content: file.content,
      purpose: "test",
    })),
    entryFile: "src/main.tsx",
    components: [],
    warnings: [],
  } as unknown as GeneratedProjectV1;
}

describe("validateVisualFidelity", () => {
  it("accepts a project that represents every major object", () => {
    const input = composition({
      objects: [
        object({ id: "phone", name: "smartphone", box: { x: 0.05, y: 0.3, width: 0.15, height: 0.4 } }),
        object({ id: "desktop", name: "desktop monitor", box: { x: 0.4, y: 0.2, width: 0.25, height: 0.5 } }),
        object({ id: "laptop", name: "laptop", box: { x: 0.75, y: 0.35, width: 0.2, height: 0.3 } }),
      ],
      majorObjectIds: ["phone", "desktop", "laptop"],
    });

    const report = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `export default function App() {
            return <div style={{ background: "#2F6DF6" }}><Smartphone /><DesktopMonitor /><Laptop /></div>;
          }`,
        },
      ]),
    );

    expect(report.acceptable).toBe(true);
    expect(report.coverage).toBe(1);
    expect(report.issues).toHaveLength(0);
  });

  it("flags a missing major object as high severity", () => {
    const input = composition({
      objects: [
        object({ id: "desktop", name: "desktop monitor", box: { x: 0.4, y: 0.2, width: 0.3, height: 0.5 } }),
        object({ id: "crane", name: "crane tower", kind: "decoration", box: { x: 0.8, y: 0.05, width: 0.15, height: 0.4 } }),
      ],
      majorObjectIds: ["desktop", "crane"],
    });

    const report = validateVisualFidelity(
      input,
      project([{ path: "src/App.tsx", content: `const x = <div className="bg-[#2f6df6]"><DesktopMonitor /></div>;` }]),
    );

    expect(report.acceptable).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "missing_major_object", severity: "high", objectId: "crane" }),
    );
  });

  it("flags a missing background fill", () => {
    const input = composition({
      objects: [object({ id: "desktop", name: "desktop monitor" })],
      majorObjectIds: ["desktop"],
    });

    const report = validateVisualFidelity(
      input,
      project([{ path: "src/App.tsx", content: `const x = <div className="bg-white"><DesktopMonitor /></div>;` }]),
    );

    expect(report.issues).toContainEqual(expect.objectContaining({ code: "wrong_background", severity: "high" }));
  });

  it("flags devices missing from a horizontal region", () => {
    const input = composition({
      objects: [
        object({ id: "phone", name: "smartphone", box: { x: 0.02, y: 0.3, width: 0.1, height: 0.4 } }),
        object({ id: "laptop", name: "laptop", box: { x: 0.8, y: 0.3, width: 0.15, height: 0.3 } }),
      ],
      majorObjectIds: ["phone", "laptop"],
    });

    const report = validateVisualFidelity(
      input,
      project([{ path: "src/App.tsx", content: `const x = <div style={{background:'#2f6df6'}}><Smartphone /></div>;` }]),
    );

    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "wrong_device_count", severity: "high" }),
    );
  });

  it("flags invented placeholder text that is absent from the source", () => {
    const input = composition({
      objects: [object({ id: "desktop", name: "desktop monitor" })],
      majorObjectIds: ["desktop"],
    });

    const report = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><DesktopMonitor>Content block 1</DesktopMonitor></div>;`,
        },
      ]),
    );

    expect(report.issues).toContainEqual(expect.objectContaining({ code: "invented_text", severity: "medium" }));
  });

  it("does not flag placeholder wording that only appears in comments", () => {
    const input = composition({
      objects: [object({ id: "desktop", name: "desktop monitor" })],
      majorObjectIds: ["desktop"],
    });

    const report = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `// Removed placeholder text to match the design
          const x = <div style={{background:'#2f6df6'}}>
            {/* Content blocks without placeholder text */}
            <DesktopMonitor />
          </div>;`,
        },
      ]),
    );

    expect(report.issues.filter((issue) => issue.code === "invented_text")).toHaveLength(0);
    expect(report.acceptable).toBe(true);
  });

  it("allows placeholder-looking text when it is genuinely legible in the source", () => {
    const input = composition({
      objects: [
        object({ id: "desktop", name: "desktop monitor" }),
        object({
          id: "label",
          name: "block label",
          kind: "text",
          textVisibility: "legible",
          text: "Content block 1",
        }),
      ],
      majorObjectIds: ["desktop", "label"],
    });

    const report = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><DesktopMonitor /><BlockLabel>Content block 1</BlockLabel></div>;`,
        },
      ]),
    );

    expect(report.issues.filter((issue) => issue.code === "invented_text")).toHaveLength(0);
  });

  it("requires SVG geometry when the composition is mostly non-rectangular", () => {
    const input = composition({
      objects: [
        object({ id: "pen", name: "pen nib", kind: "tool" }),
        object({ id: "cans", name: "paint cans", kind: "tool" }),
        object({ id: "crane", name: "crane tower", kind: "decoration" }),
      ],
      majorObjectIds: ["pen", "cans", "crane"],
    });

    const withoutSvg = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><PenNib /><PaintCans /><CraneTower /></div>;`,
        },
      ]),
    );
    expect(withoutSvg.issues).toContainEqual(expect.objectContaining({ code: "insufficient_geometry" }));

    const withSvg = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><svg viewBox="0 0 2000 1111"><PenNib /><PaintCans /><CraneTower /></svg></div>;`,
        },
      ]),
    );
    expect(withSvg.issues.filter((issue) => issue.code === "insufficient_geometry")).toHaveLength(0);
    expect(withSvg.acceptable).toBe(true);
  });

  it("requires SVG geometry when the composition includes chart objects", () => {
    const input = composition({
      objects: [
        object({ id: "bar-chart", name: "revenue bar chart", kind: "chart" }),
        object({ id: "line-chart", name: "trend line chart", kind: "chart" }),
        object({ id: "pie-chart", name: "share pie chart", kind: "chart" }),
      ],
      majorObjectIds: ["bar-chart", "line-chart", "pie-chart"],
    });

    const withoutSvg = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><RevenueBarChart /><TrendLineChart /><SharePieChart /></div>;`,
        },
      ]),
    );
    expect(withoutSvg.issues).toContainEqual(expect.objectContaining({ code: "insufficient_geometry" }));

    const withSvg = validateVisualFidelity(
      input,
      project([
        {
          path: "src/App.tsx",
          content: `const x = <div style={{background:'#2f6df6'}}><svg viewBox="0 0 1440 900"><RevenueBarChart /><TrendLineChart /><SharePieChart /></svg></div>;`,
        },
      ]),
    );
    expect(withSvg.issues.filter((issue) => issue.code === "insufficient_geometry")).toHaveLength(0);
    expect(withSvg.acceptable).toBe(true);
  });
});
