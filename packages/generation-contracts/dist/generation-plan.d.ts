import { z } from "zod";
export declare const PlannedPropSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    required: z.ZodBoolean;
    description: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: string;
    description: string;
    required: boolean;
}, {
    name: string;
    type: string;
    description: string;
    required: boolean;
}>;
export declare const PlannedComponentSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodString;
    purpose: z.ZodString;
    props: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        required: z.ZodBoolean;
        description: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type: string;
        description: string;
        required: boolean;
    }, {
        name: string;
        type: string;
        description: string;
        required: boolean;
    }>, "many">;
    children: z.ZodBoolean;
    dependencies: z.ZodArray<z.ZodString, "many">;
    accessibilityNotes: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: string;
    props: {
        name: string;
        type: string;
        description: string;
        required: boolean;
    }[];
    children: boolean;
    purpose: string;
    dependencies: string[];
    accessibilityNotes: string;
}, {
    name: string;
    type: string;
    props: {
        name: string;
        type: string;
        description: string;
        required: boolean;
    }[];
    children: boolean;
    purpose: string;
    dependencies: string[];
    accessibilityNotes: string;
}>;
export declare const PlannedFileSchema: z.ZodObject<{
    path: z.ZodString;
    language: z.ZodEnum<["tsx", "ts", "css", "json", "html", "js"]>;
    purpose: z.ZodString;
    components: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    path: string;
    purpose: string;
    language: "tsx" | "ts" | "css" | "json" | "html" | "js";
    components: string[];
}, {
    path: string;
    purpose: string;
    language: "tsx" | "ts" | "css" | "json" | "html" | "js";
    components: string[];
}>;
export declare const DesignTokensSchema: z.ZodObject<{
    colors: z.ZodRecord<z.ZodString, z.ZodString>;
    typography: z.ZodRecord<z.ZodString, z.ZodString>;
    spacing: z.ZodRecord<z.ZodString, z.ZodString>;
    borderRadius: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    shadows: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    colors: Record<string, string>;
    typography: Record<string, string>;
    spacing: Record<string, string>;
    shadows?: Record<string, string> | undefined;
    borderRadius?: Record<string, string> | undefined;
}, {
    colors: Record<string, string>;
    typography: Record<string, string>;
    spacing: Record<string, string>;
    shadows?: Record<string, string> | undefined;
    borderRadius?: Record<string, string> | undefined;
}>;
export declare const GenerationPlanV1Schema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1">;
    responseVersion: z.ZodString;
    components: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodString;
        purpose: z.ZodString;
        props: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodString;
            required: z.ZodBoolean;
            description: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }, {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }>, "many">;
        children: z.ZodBoolean;
        dependencies: z.ZodArray<z.ZodString, "many">;
        accessibilityNotes: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type: string;
        props: {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }[];
        children: boolean;
        purpose: string;
        dependencies: string[];
        accessibilityNotes: string;
    }, {
        name: string;
        type: string;
        props: {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }[];
        children: boolean;
        purpose: string;
        dependencies: string[];
        accessibilityNotes: string;
    }>, "many">;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        language: z.ZodEnum<["tsx", "ts", "css", "json", "html", "js"]>;
        purpose: z.ZodString;
        components: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        components: string[];
    }, {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        components: string[];
    }>, "many">;
    designTokens: z.ZodObject<{
        colors: z.ZodRecord<z.ZodString, z.ZodString>;
        typography: z.ZodRecord<z.ZodString, z.ZodString>;
        spacing: z.ZodRecord<z.ZodString, z.ZodString>;
        borderRadius: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        shadows: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        colors: Record<string, string>;
        typography: Record<string, string>;
        spacing: Record<string, string>;
        shadows?: Record<string, string> | undefined;
        borderRadius?: Record<string, string> | undefined;
    }, {
        colors: Record<string, string>;
        typography: Record<string, string>;
        spacing: Record<string, string>;
        shadows?: Record<string, string> | undefined;
        borderRadius?: Record<string, string> | undefined;
    }>;
    dependencies: z.ZodRecord<z.ZodString, z.ZodString>;
    devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    responsiveStrategy: z.ZodString;
    accessibilityStrategy: z.ZodString;
    confidenceWarnings: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schemaVersion: "1";
    responseVersion: string;
    dependencies: Record<string, string>;
    files: {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        components: string[];
    }[];
    components: {
        name: string;
        type: string;
        props: {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }[];
        children: boolean;
        purpose: string;
        dependencies: string[];
        accessibilityNotes: string;
    }[];
    designTokens: {
        colors: Record<string, string>;
        typography: Record<string, string>;
        spacing: Record<string, string>;
        shadows?: Record<string, string> | undefined;
        borderRadius?: Record<string, string> | undefined;
    };
    responsiveStrategy: string;
    accessibilityStrategy: string;
    confidenceWarnings: string[];
    devDependencies?: Record<string, string> | undefined;
}, {
    schemaVersion: "1";
    responseVersion: string;
    dependencies: Record<string, string>;
    files: {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        components: string[];
    }[];
    components: {
        name: string;
        type: string;
        props: {
            name: string;
            type: string;
            description: string;
            required: boolean;
        }[];
        children: boolean;
        purpose: string;
        dependencies: string[];
        accessibilityNotes: string;
    }[];
    designTokens: {
        colors: Record<string, string>;
        typography: Record<string, string>;
        spacing: Record<string, string>;
        shadows?: Record<string, string> | undefined;
        borderRadius?: Record<string, string> | undefined;
    };
    responsiveStrategy: string;
    accessibilityStrategy: string;
    confidenceWarnings: string[];
    devDependencies?: Record<string, string> | undefined;
}>;
export type GenerationPlanV1 = z.infer<typeof GenerationPlanV1Schema>;
export type PlannedComponent = z.infer<typeof PlannedComponentSchema>;
//# sourceMappingURL=generation-plan.d.ts.map