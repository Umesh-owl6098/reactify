/**
 * Structural fidelity checks between a source composition and generated code.
 *
 * The pixel comparison in `comparisonEngine` answers "how different are these
 * two images", which needs a rendered preview and gives a single number. This
 * runs earlier, on the source, and answers the question that number cannot:
 * *which* parts of the design are missing or misplaced. A result can score
 * respectably on pixels while every tool and decoration has been dropped,
 * because the background dominates the frame.
 */
import {
  boxArea,
  horizontalRegion,
  majorObjects,
  type CompositionRegion,
  type GeneratedProjectV1,
  type VisualCompositionV1,
  type VisualObject,
} from "@reactify/generation-contracts";

export type VisualFidelitySeverity = "high" | "medium" | "low";

export type VisualFidelityIssueCode =
  | "missing_major_object"
  | "object_wrong_region"
  | "wrong_background"
  | "wrong_device_count"
  | "proportion_mismatch"
  | "invented_text"
  | "insufficient_geometry";

export interface VisualFidelityIssue {
  code: VisualFidelityIssueCode;
  severity: VisualFidelitySeverity;
  message: string;
  objectId?: string;
}

export interface VisualFidelityReport {
  acceptable: boolean;
  issues: VisualFidelityIssue[];
  checkedObjects: number;
  representedObjects: number;
  /** Fraction of major objects that could be located in the generated source. */
  coverage: number;
}

/** Wording a model reaches for when it has nothing real to render. */
const INVENTED_TEXT_PATTERNS = [
  /\bcontent block\s*\d*/i,
  /\blorem ipsum\b/i,
  /\bplaceholder (?:text|content|title)\b/i,
  /\bcard (?:title|text)\s*\d*\b/i,
  /\bsample (?:text|content)\b/i,
  /\byour (?:text|content) here\b/i,
];

const MIN_MAJOR_COVERAGE = 0.8;

function projectSource(project: GeneratedProjectV1): string {
  return project.files
    .filter((file) => file.language === "tsx" || file.language === "ts" || file.language === "js")
    .map((file) => file.content)
    .join("\n");
}

/**
 * Comments discussing placeholder text are not placeholder text. A note reading
 * "removed placeholder text to match design" describes the fix, so scanning raw
 * source would flag the very change that resolved the issue.
 */
function stripComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Split a name into the words worth matching against generated identifiers. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

/**
 * Generated code names things in its own style, so match on tokens rather than
 * on the analyst's exact phrasing: "paint can" should match `PaintCan`,
 * `paint-can`, or an aria-label of "Paint can".
 */
function isObjectRepresented(object: VisualObject, haystack: string): boolean {
  const tokens = nameTokens(object.name);
  if (tokens.length === 0) {
    return false;
  }

  const normalized = haystack.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const matched = tokens.filter((token) => normalized.includes(token));
  return matched.length === tokens.length;
}

function normalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

/** Tailwind arbitrary values, style objects, and CSS all end up as raw hex. */
function backgroundIsPresent(composition: VisualCompositionV1, project: GeneratedProjectV1): boolean {
  const target = normalizeHex(composition.backgroundColor);
  return project.files.some((file) => file.content.toLowerCase().includes(target));
}

function countByRegion(objects: VisualObject[]): Record<CompositionRegion, number> {
  return objects.reduce(
    (counts, object) => {
      counts[horizontalRegion(object.box)] += 1;
      return counts;
    },
    { left: 0, center: 0, right: 0 } as Record<CompositionRegion, number>,
  );
}

export function validateVisualFidelity(
  composition: VisualCompositionV1,
  project: GeneratedProjectV1,
): VisualFidelityReport {
  const issues: VisualFidelityIssue[] = [];
  const source = projectSource(project);
  const allSource = project.files.map((file) => file.content).join("\n");
  const majors = majorObjects(composition);

  let represented = 0;
  for (const object of majors) {
    if (isObjectRepresented(object, allSource)) {
      represented += 1;
      continue;
    }

    issues.push({
      code: "missing_major_object",
      severity: "high",
      objectId: object.id,
      message: `Major object "${object.name}" is not represented in the generated project.`,
    });
  }

  const coverage = majors.length === 0 ? 1 : represented / majors.length;

  if (composition.backgroundFillsFrame && !backgroundIsPresent(composition, project)) {
    issues.push({
      code: "wrong_background",
      severity: "high",
      message: `Background colour ${composition.backgroundColor} does not appear anywhere in the generated project.`,
    });
  }

  const devices = composition.objects.filter((object) => object.kind === "device");
  if (devices.length > 0) {
    const regions = countByRegion(devices);
    for (const [region, expected] of Object.entries(regions) as Array<[CompositionRegion, number]>) {
      if (expected === 0) {
        continue;
      }
      const found = devices
        .filter((device) => horizontalRegion(device.box) === region)
        .filter((device) => isObjectRepresented(device, allSource)).length;
      if (found < expected) {
        issues.push({
          code: "wrong_device_count",
          severity: "high",
          message: `Expected ${expected} device(s) in the ${region} region but found ${found}.`,
        });
      }
    }
  }

  // A composition dominated by non-rectangular shapes cannot be reproduced with
  // divs alone, so the absence of any SVG is itself a structural failure.
  const needsGeometry = composition.objects.filter(
    (object) =>
      object.kind === "tool" ||
      object.kind === "decoration" ||
      object.kind === "illustration" ||
      object.kind === "chart",
  );
  if (needsGeometry.length >= 3 && !/<svg[\s>]/i.test(source)) {
    issues.push({
      code: "insufficient_geometry",
      severity: "high",
      message: `Composition has ${needsGeometry.length} non-rectangular objects but the project contains no SVG geometry.`,
    });
  }

  const legibleText = new Set(
    composition.objects
      .filter((object) => object.textVisibility === "legible" && object.text)
      .map((object) => object.text!.trim().toLowerCase()),
  );

  const renderableSource = stripComments(source);
  for (const pattern of INVENTED_TEXT_PATTERNS) {
    const match = renderableSource.match(pattern);
    if (!match) {
      continue;
    }
    if (legibleText.has(match[0].trim().toLowerCase())) {
      continue;
    }
    issues.push({
      code: "invented_text",
      severity: "medium",
      message: `Generated project renders invented placeholder text "${match[0]}" that is not present in the source.`,
    });
  }

  const largest = majors.reduce<VisualObject | null>(
    (winner, object) => (winner === null || boxArea(object.box) > boxArea(winner.box) ? object : winner),
    null,
  );
  if (largest && !isObjectRepresented(largest, allSource)) {
    issues.push({
      code: "proportion_mismatch",
      severity: "high",
      objectId: largest.id,
      message: `The largest object "${largest.name}" is missing, so relative proportions cannot match.`,
    });
  }

  const acceptable = !issues.some((issue) => issue.severity === "high") && coverage >= MIN_MAJOR_COVERAGE;

  return {
    acceptable,
    issues,
    checkedObjects: majors.length,
    representedObjects: represented,
    coverage: Number(coverage.toFixed(4)),
  };
}

export function summarizeFidelityIssues(report: VisualFidelityReport): string {
  if (report.issues.length === 0) {
    return "All major source objects are represented.";
  }

  return report.issues.map((issue) => `[${issue.severity}] ${issue.message}`).join("\n");
}

export { MIN_MAJOR_COVERAGE };
