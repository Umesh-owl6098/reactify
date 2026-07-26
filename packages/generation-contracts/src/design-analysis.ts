import { z } from "zod";
import { VisualCompositionV1Schema } from "./visual-composition.js";

/**
 * Models express "this field does not apply" as an explicit null far more often
 * than by omitting the key. Treating that as a schema violation throws away an
 * otherwise complete analysis over a field the pipeline does not even require,
 * so optional strings accept null and normalize it to undefined.
 */
const optionalText = () =>
  z
    .string()
    .nullish()
    .transform((value) => value ?? undefined);

export const ColorTokenSchema = z.object({
  name: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  usage: optionalText(),
});

export const TypographyTokenSchema = z.object({
  element: z.string(),
  fontFamily: z.string(),
  fontSize: z.string(),
  fontWeight: z.string(),
  lineHeight: optionalText(),
  letterSpacing: optionalText(),
});

export const SpacingTokenSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export interface ComponentNode {
  id: string;
  type: string;
  description: string;
  props?: Record<string, unknown>;
  children?: ComponentNode[];
  interactions?: string[];
  responsive?: string;
}

// Input is `unknown` rather than ComponentNode because the null-tolerant
// transforms above accept a wider shape than they produce.
export const ComponentNodeSchema: z.ZodType<ComponentNode, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    description: z.string(),
    props: z.record(z.unknown()).nullish().transform((value) => value ?? undefined),
    children: z
      .array(ComponentNodeSchema)
      .nullish()
      .transform((value) => value ?? undefined),
    interactions: z
      .array(z.string())
      .nullish()
      .transform((value) => value ?? undefined),
    responsive: optionalText(),
  }),
);

export const DesignAnalysisV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  layoutHierarchy: z.string(),
  componentHierarchy: z.array(ComponentNodeSchema),
  colors: z.array(ColorTokenSchema),
  typography: z.array(TypographyTokenSchema),
  spacing: z.array(SpacingTokenSchema),
  borders: optionalText(),
  shadows: optionalText(),
  icons: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? undefined),
  imagePlaceholders: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? undefined),
  interactions: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? undefined),
  responsiveBehavior: optionalText(),
  /**
   * Optional so analyses produced before the composition format still parse.
   * Fidelity validation is skipped when it is absent rather than failing the run.
   */
  visualComposition: VisualCompositionV1Schema.nullish().transform((value) => value ?? undefined),
});

export type DesignAnalysisV1 = z.infer<typeof DesignAnalysisV1Schema>;
