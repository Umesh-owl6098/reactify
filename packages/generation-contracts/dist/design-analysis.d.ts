import { z } from "zod";
export declare const ColorTokenSchema: z.ZodObject<{
    name: z.ZodString;
    hex: z.ZodString;
    usage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    hex: string;
    usage?: string | undefined;
}, {
    name: string;
    hex: string;
    usage?: string | undefined;
}>;
export declare const TypographyTokenSchema: z.ZodObject<{
    element: z.ZodString;
    fontFamily: z.ZodString;
    fontSize: z.ZodString;
    fontWeight: z.ZodString;
    lineHeight: z.ZodOptional<z.ZodString>;
    letterSpacing: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    element: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight?: string | undefined;
    letterSpacing?: string | undefined;
}, {
    element: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight?: string | undefined;
    letterSpacing?: string | undefined;
}>;
export declare const SpacingTokenSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    value: string;
}, {
    name: string;
    value: string;
}>;
export interface ComponentNode {
    id: string;
    type: string;
    description: string;
    props?: Record<string, unknown>;
    children?: ComponentNode[];
    interactions?: string[];
    responsive?: string;
}
export declare const ComponentNodeSchema: z.ZodType<ComponentNode>;
export declare const DesignAnalysisV1Schema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1">;
    responseVersion: z.ZodString;
    layoutHierarchy: z.ZodString;
    componentHierarchy: z.ZodArray<z.ZodType<ComponentNode, z.ZodTypeDef, ComponentNode>, "many">;
    colors: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        hex: z.ZodString;
        usage: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        hex: string;
        usage?: string | undefined;
    }, {
        name: string;
        hex: string;
        usage?: string | undefined;
    }>, "many">;
    typography: z.ZodArray<z.ZodObject<{
        element: z.ZodString;
        fontFamily: z.ZodString;
        fontSize: z.ZodString;
        fontWeight: z.ZodString;
        lineHeight: z.ZodOptional<z.ZodString>;
        letterSpacing: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        element: string;
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        lineHeight?: string | undefined;
        letterSpacing?: string | undefined;
    }, {
        element: string;
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        lineHeight?: string | undefined;
        letterSpacing?: string | undefined;
    }>, "many">;
    spacing: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        value: string;
    }, {
        name: string;
        value: string;
    }>, "many">;
    borders: z.ZodOptional<z.ZodString>;
    shadows: z.ZodOptional<z.ZodString>;
    icons: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    imagePlaceholders: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    interactions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    responsiveBehavior: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    schemaVersion: "1";
    responseVersion: string;
    layoutHierarchy: string;
    componentHierarchy: ComponentNode[];
    colors: {
        name: string;
        hex: string;
        usage?: string | undefined;
    }[];
    typography: {
        element: string;
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        lineHeight?: string | undefined;
        letterSpacing?: string | undefined;
    }[];
    spacing: {
        name: string;
        value: string;
    }[];
    borders?: string | undefined;
    shadows?: string | undefined;
    icons?: string[] | undefined;
    imagePlaceholders?: string[] | undefined;
    interactions?: string[] | undefined;
    responsiveBehavior?: string | undefined;
}, {
    schemaVersion: "1";
    responseVersion: string;
    layoutHierarchy: string;
    componentHierarchy: ComponentNode[];
    colors: {
        name: string;
        hex: string;
        usage?: string | undefined;
    }[];
    typography: {
        element: string;
        fontFamily: string;
        fontSize: string;
        fontWeight: string;
        lineHeight?: string | undefined;
        letterSpacing?: string | undefined;
    }[];
    spacing: {
        name: string;
        value: string;
    }[];
    borders?: string | undefined;
    shadows?: string | undefined;
    icons?: string[] | undefined;
    imagePlaceholders?: string[] | undefined;
    interactions?: string[] | undefined;
    responsiveBehavior?: string | undefined;
}>;
export type DesignAnalysisV1 = z.infer<typeof DesignAnalysisV1Schema>;
//# sourceMappingURL=design-analysis.d.ts.map