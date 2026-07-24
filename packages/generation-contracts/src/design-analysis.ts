import { z } from "zod";

export const ColorTokenSchema = z.object({
  name: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  usage: z.string().optional(),
});

export const TypographyTokenSchema = z.object({
  element: z.string(),
  fontFamily: z.string(),
  fontSize: z.string(),
  fontWeight: z.string(),
  lineHeight: z.string().optional(),
  letterSpacing: z.string().optional(),
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

export const ComponentNodeSchema: z.ZodType<ComponentNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    type: z.string(),
    description: z.string(),
    props: z.record(z.unknown()).optional(),
    children: z.array(ComponentNodeSchema).optional(),
    interactions: z.array(z.string()).optional(),
    responsive: z.string().optional(),
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
  borders: z.string().optional(),
  shadows: z.string().optional(),
  icons: z.array(z.string()).optional(),
  imagePlaceholders: z.array(z.string()).optional(),
  interactions: z.array(z.string()).optional(),
  responsiveBehavior: z.string().optional(),
});

export type DesignAnalysisV1 = z.infer<typeof DesignAnalysisV1Schema>;
