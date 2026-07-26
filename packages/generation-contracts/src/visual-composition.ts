import { z } from "zod";

/**
 * Structured spatial description of a source screenshot.
 *
 * The component hierarchy in DesignAnalysisV1 describes *what kind* of UI is in
 * a screenshot, which is enough for conventional dashboards and marketing pages.
 * It carries no geometry, so illustrations collapse into generic boxes: three
 * device mockups become three rectangles and every surrounding tool, ladder, or
 * crane disappears because nothing in the analysis records that it was there.
 *
 * This schema records position, size, layering, and silhouette for every major
 * object so generation has something concrete to reproduce and so fidelity
 * validation can tell whether an object survived.
 */

/**
 * Vision models routinely report a box that runs a few percent past an edge, or
 * a rotation of 190 degrees. Those are usable observations, so clamp them into
 * range rather than discarding an entire analysis over them.
 */
const clamped = (min: number, max: number) =>
  z.number().transform((value) => Math.min(max, Math.max(min, value)));

/** Normalized to the source frame: 0 is the left/top edge, 1 the right/bottom. */
export const NormalizedBoxSchema = z.object({
  x: clamped(0, 1),
  y: clamped(0, 1),
  width: clamped(0, 1),
  height: clamped(0, 1),
});

export type NormalizedBox = z.infer<typeof NormalizedBoxSchema>;

export const VisualObjectKindSchema = z.enum([
  "device",
  "tool",
  "decoration",
  "text",
  "control",
  "surface",
  "illustration",
  "background",
]);

export type VisualObjectKind = z.infer<typeof VisualObjectKindSchema>;

export const TextVisibilitySchema = z.enum(["legible", "partially_legible", "illegible", "none"]);

export const VisualObjectSchema = z.object({
  id: z.string().min(1),
  /** Free-form label, e.g. "desktop monitor", "paint can", "crane tower". */
  name: z.string().min(1),
  kind: VisualObjectKindSchema,
  box: NormalizedBoxSchema,
  /** Higher paints later. Used to reproduce overlaps. */
  layer: z.number().transform((value) => Math.max(0, Math.round(value))),
  /** Shape of the object independent of its contents. */
  silhouette: z.string().min(1),
  rotationDegrees: clamped(-180, 180).nullish().transform((value) => value ?? 0),
  /** Area relative to the largest object in the composition. */
  relativeScale: clamped(0, 1)
    .nullish()
    .transform((value) => value ?? 1),
  dominantColors: z
    .array(z.string())
    .nullish()
    .transform((value) => (value ?? []).filter((hex) => /^#[0-9a-fA-F]{6}$/.test(hex))),
  subComponents: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  textVisibility: TextVisibilitySchema.nullish().transform((value) => value ?? "none"),
  /** Only set when textVisibility is "legible"; never guessed. */
  text: z.string().nullish().transform((value) => value ?? null),
  /** ids of objects this one visually connects to (cables, hooks, beams). */
  connectedTo: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  responsiveBehavior: z.string().nullish().transform((value) => value ?? null),
  confidence: clamped(0, 1),
});

export type VisualObject = z.infer<typeof VisualObjectSchema>;

export const VisualCompositionV1Schema = z.object({
  schemaVersion: z.literal("1"),
  sourceWidth: z.number().positive().transform((value) => Math.round(value)),
  sourceHeight: z.number().positive().transform((value) => Math.round(value)),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  /** True when the background is a flat fill covering the whole frame. */
  backgroundFillsFrame: z.boolean().nullish().transform((value) => value ?? true),
  /** Ordered back-to-front. */
  objects: z.array(VisualObjectSchema),
  /** Objects the analyst judged essential to recognising the design. */
  majorObjectIds: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  notes: z.string().nullish().transform((value) => value ?? null),
});

export type VisualCompositionV1 = z.infer<typeof VisualCompositionV1Schema>;

/** Coarse thirds used by fidelity checks so small drifts are not flagged. */
export type CompositionRegion = "left" | "center" | "right";

export function horizontalRegion(box: NormalizedBox): CompositionRegion {
  const centerX = box.x + box.width / 2;
  if (centerX < 1 / 3) {
    return "left";
  }
  if (centerX > 2 / 3) {
    return "right";
  }
  return "center";
}

export function boxArea(box: NormalizedBox): number {
  return box.width * box.height;
}

export function majorObjects(composition: VisualCompositionV1): VisualObject[] {
  if (composition.majorObjectIds.length > 0) {
    const ids = new Set(composition.majorObjectIds);
    return composition.objects.filter((object) => ids.has(object.id));
  }

  // Fall back to area so a composition without explicit majors still validates.
  return composition.objects.filter((object) => object.kind !== "background" && boxArea(object.box) >= 0.02);
}
