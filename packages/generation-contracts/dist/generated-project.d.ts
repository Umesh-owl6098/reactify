import { z } from "zod";
export declare const PropDefinitionSchema: z.ZodObject<{
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
export declare const ComponentMetadataSchema: z.ZodObject<{
    name: z.ZodString;
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
export declare const GeneratedFileSchema: z.ZodObject<{
    path: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    language: z.ZodEnum<["tsx", "ts", "css", "json", "html", "js"]>;
    content: z.ZodString;
    purpose: z.ZodString;
    componentMetadata: z.ZodOptional<z.ZodObject<{
        name: z.ZodString;
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
    }>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    purpose: string;
    language: "tsx" | "ts" | "css" | "json" | "html" | "js";
    content: string;
    componentMetadata?: {
        name: string;
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
    } | undefined;
}, {
    path: string;
    purpose: string;
    language: "tsx" | "ts" | "css" | "json" | "html" | "js";
    content: string;
    componentMetadata?: {
        name: string;
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
    } | undefined;
}>;
export declare const GeneratedProjectV1Schema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<"1">;
    responseVersion: z.ZodString;
    projectName: z.ZodString;
    summary: z.ZodString;
    generationPlanRef: z.ZodOptional<z.ZodString>;
    designAnalysisRef: z.ZodOptional<z.ZodString>;
    dependencies: z.ZodRecord<z.ZodString, z.ZodString>;
    devDependencies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
        language: z.ZodEnum<["tsx", "ts", "css", "json", "html", "js"]>;
        content: z.ZodString;
        purpose: z.ZodString;
        componentMetadata: z.ZodOptional<z.ZodObject<{
            name: z.ZodString;
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
        }>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        content: string;
        componentMetadata?: {
            name: string;
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
        } | undefined;
    }, {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        content: string;
        componentMetadata?: {
            name: string;
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
        } | undefined;
    }>, "many">;
    entryFile: z.ZodString;
    warnings: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    schemaVersion: "1";
    responseVersion: string;
    dependencies: Record<string, string>;
    projectName: string;
    summary: string;
    files: {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        content: string;
        componentMetadata?: {
            name: string;
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
        } | undefined;
    }[];
    entryFile: string;
    warnings: string[];
    generationPlanRef?: string | undefined;
    designAnalysisRef?: string | undefined;
    devDependencies?: Record<string, string> | undefined;
}, {
    schemaVersion: "1";
    responseVersion: string;
    dependencies: Record<string, string>;
    projectName: string;
    summary: string;
    files: {
        path: string;
        purpose: string;
        language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        content: string;
        componentMetadata?: {
            name: string;
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
        } | undefined;
    }[];
    entryFile: string;
    warnings: string[];
    generationPlanRef?: string | undefined;
    designAnalysisRef?: string | undefined;
    devDependencies?: Record<string, string> | undefined;
}>;
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type GeneratedProjectV1 = z.infer<typeof GeneratedProjectV1Schema>;
export type ComponentMetadata = z.infer<typeof ComponentMetadataSchema>;
//# sourceMappingURL=generated-project.d.ts.map