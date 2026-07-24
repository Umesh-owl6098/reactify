import { z } from "zod";
export declare const GenerationUserStatusSchema: z.ZodEnum<["Queued", "Uploading", "Analyzing", "Planning", "Generating", "Validating", "Compiling", "Repairing", "Ready", "Failed", "Cancelled"]>;
export declare const GenerationErrorSchema: z.ZodObject<{
    stage: z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>;
    code: z.ZodString;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
    message: string;
    stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
}, {
    code: string;
    message: string;
    stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
}>;
export declare const GenerationOutputsSchema: z.ZodObject<{
    designAnalysis: z.ZodNullable<z.ZodObject<{
        schemaVersion: z.ZodLiteral<"1">;
        responseVersion: z.ZodString;
        layoutHierarchy: z.ZodString;
        componentHierarchy: z.ZodArray<z.ZodType<import("./design-analysis.js").ComponentNode, z.ZodTypeDef, import("./design-analysis.js").ComponentNode>, "many">;
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
            value: string;
            name: string;
        }, {
            value: string;
            name: string;
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
        componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
            value: string;
            name: string;
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
        componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
            value: string;
            name: string;
        }[];
        borders?: string | undefined;
        shadows?: string | undefined;
        icons?: string[] | undefined;
        imagePlaceholders?: string[] | undefined;
        interactions?: string[] | undefined;
        responsiveBehavior?: string | undefined;
    }>>;
    generationPlan: z.ZodNullable<z.ZodObject<{
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
                type: string;
                name: string;
                required: boolean;
                description: string;
            }, {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }>, "many">;
            children: z.ZodBoolean;
            dependencies: z.ZodArray<z.ZodString, "many">;
            accessibilityNotes: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
            dependencies: string[];
            accessibilityNotes: string;
        }, {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
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
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
        }, {
            path: string;
            purpose: string;
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        components: {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
            dependencies: string[];
            accessibilityNotes: string;
        }[];
        files: {
            path: string;
            purpose: string;
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        components: {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
            dependencies: string[];
            accessibilityNotes: string;
        }[];
        files: {
            path: string;
            purpose: string;
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
    }>>;
    generatedProject: z.ZodNullable<z.ZodObject<{
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
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }, {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }>, "many">;
                children: z.ZodBoolean;
                dependencies: z.ZodArray<z.ZodString, "many">;
                accessibilityNotes: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }, {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
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
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
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
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
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
        files: {
            path: string;
            purpose: string;
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
            content: string;
            componentMetadata?: {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            } | undefined;
        }[];
        projectName: string;
        summary: string;
        entryFile: string;
        warnings: string[];
        devDependencies?: Record<string, string> | undefined;
        generationPlanRef?: string | undefined;
        designAnalysisRef?: string | undefined;
    }, {
        schemaVersion: "1";
        responseVersion: string;
        dependencies: Record<string, string>;
        files: {
            path: string;
            purpose: string;
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
            content: string;
            componentMetadata?: {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            } | undefined;
        }[];
        projectName: string;
        summary: string;
        entryFile: string;
        warnings: string[];
        devDependencies?: Record<string, string> | undefined;
        generationPlanRef?: string | undefined;
        designAnalysisRef?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    designAnalysis: {
        schemaVersion: "1";
        responseVersion: string;
        layoutHierarchy: string;
        componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
            value: string;
            name: string;
        }[];
        borders?: string | undefined;
        shadows?: string | undefined;
        icons?: string[] | undefined;
        imagePlaceholders?: string[] | undefined;
        interactions?: string[] | undefined;
        responsiveBehavior?: string | undefined;
    } | null;
    generationPlan: {
        schemaVersion: "1";
        responseVersion: string;
        dependencies: Record<string, string>;
        components: {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
            dependencies: string[];
            accessibilityNotes: string;
        }[];
        files: {
            path: string;
            purpose: string;
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
    } | null;
    generatedProject: {
        schemaVersion: "1";
        responseVersion: string;
        dependencies: Record<string, string>;
        files: {
            path: string;
            purpose: string;
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
            content: string;
            componentMetadata?: {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            } | undefined;
        }[];
        projectName: string;
        summary: string;
        entryFile: string;
        warnings: string[];
        devDependencies?: Record<string, string> | undefined;
        generationPlanRef?: string | undefined;
        designAnalysisRef?: string | undefined;
    } | null;
}, {
    designAnalysis: {
        schemaVersion: "1";
        responseVersion: string;
        layoutHierarchy: string;
        componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
            value: string;
            name: string;
        }[];
        borders?: string | undefined;
        shadows?: string | undefined;
        icons?: string[] | undefined;
        imagePlaceholders?: string[] | undefined;
        interactions?: string[] | undefined;
        responsiveBehavior?: string | undefined;
    } | null;
    generationPlan: {
        schemaVersion: "1";
        responseVersion: string;
        dependencies: Record<string, string>;
        components: {
            type: string;
            name: string;
            purpose: string;
            props: {
                type: string;
                name: string;
                required: boolean;
                description: string;
            }[];
            children: boolean;
            dependencies: string[];
            accessibilityNotes: string;
        }[];
        files: {
            path: string;
            purpose: string;
            components: string[];
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
    } | null;
    generatedProject: {
        schemaVersion: "1";
        responseVersion: string;
        dependencies: Record<string, string>;
        files: {
            path: string;
            purpose: string;
            language: "tsx" | "ts" | "css" | "json" | "html" | "js";
            content: string;
            componentMetadata?: {
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            } | undefined;
        }[];
        projectName: string;
        summary: string;
        entryFile: string;
        warnings: string[];
        devDependencies?: Record<string, string> | undefined;
        generationPlanRef?: string | undefined;
        designAnalysisRef?: string | undefined;
    } | null;
}>;
export declare const GenerationDurationsSchema: z.ZodObject<{
    totalMs: z.ZodNumber;
    stages: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    totalMs: number;
    stages: Record<string, number>;
}, {
    totalMs: number;
    stages: Record<string, number>;
}>;
export declare const CreateGenerationRequestSchema: z.ZodObject<{
    imageId: z.ZodString;
    projectId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    imageId: string;
    projectId?: string | undefined;
}, {
    imageId: string;
    projectId?: string | undefined;
}>;
export declare const CreateGenerationResponseSchema: z.ZodObject<{
    generationId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    generationId: string;
}, {
    generationId: string;
}>;
export declare const GenerationStatusResponseSchema: z.ZodObject<{
    id: z.ZodString;
    imageId: z.ZodString;
    projectId: z.ZodString;
    status: z.ZodEnum<["Queued", "Uploading", "Analyzing", "Planning", "Generating", "Validating", "Compiling", "Repairing", "Ready", "Failed", "Cancelled"]>;
    activeStage: z.ZodNullable<z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>>;
    stages: z.ZodArray<z.ZodObject<{
        stage: z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>;
        status: z.ZodEnum<["pending", "running", "completed", "failed", "skipped", "cancelled"]>;
        startedAt: z.ZodOptional<z.ZodString>;
        completedAt: z.ZodOptional<z.ZodString>;
        durationMs: z.ZodOptional<z.ZodNumber>;
        errorCode: z.ZodOptional<z.ZodString>;
        errorMessage: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
        startedAt?: string | undefined;
        completedAt?: string | undefined;
        durationMs?: number | undefined;
        errorCode?: string | undefined;
        errorMessage?: string | undefined;
    }, {
        status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
        startedAt?: string | undefined;
        completedAt?: string | undefined;
        durationMs?: number | undefined;
        errorCode?: string | undefined;
        errorMessage?: string | undefined;
    }>, "many">;
    outputs: z.ZodObject<{
        designAnalysis: z.ZodNullable<z.ZodObject<{
            schemaVersion: z.ZodLiteral<"1">;
            responseVersion: z.ZodString;
            layoutHierarchy: z.ZodString;
            componentHierarchy: z.ZodArray<z.ZodType<import("./design-analysis.js").ComponentNode, z.ZodTypeDef, import("./design-analysis.js").ComponentNode>, "many">;
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
                value: string;
                name: string;
            }, {
                value: string;
                name: string;
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
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
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
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
            }[];
            borders?: string | undefined;
            shadows?: string | undefined;
            icons?: string[] | undefined;
            imagePlaceholders?: string[] | undefined;
            interactions?: string[] | undefined;
            responsiveBehavior?: string | undefined;
        }>>;
        generationPlan: z.ZodNullable<z.ZodObject<{
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
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }, {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }>, "many">;
                children: z.ZodBoolean;
                dependencies: z.ZodArray<z.ZodString, "many">;
                accessibilityNotes: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }, {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
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
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
            }, {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        }>>;
        generatedProject: z.ZodNullable<z.ZodObject<{
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
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }, {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }>, "many">;
                    children: z.ZodBoolean;
                    dependencies: z.ZodArray<z.ZodString, "many">;
                    accessibilityNotes: z.ZodString;
                }, "strip", z.ZodTypeAny, {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                }, {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
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
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
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
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
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
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        }, {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        designAnalysis: {
            schemaVersion: "1";
            responseVersion: string;
            layoutHierarchy: string;
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
            }[];
            borders?: string | undefined;
            shadows?: string | undefined;
            icons?: string[] | undefined;
            imagePlaceholders?: string[] | undefined;
            interactions?: string[] | undefined;
            responsiveBehavior?: string | undefined;
        } | null;
        generationPlan: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        } | null;
        generatedProject: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        } | null;
    }, {
        designAnalysis: {
            schemaVersion: "1";
            responseVersion: string;
            layoutHierarchy: string;
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
            }[];
            borders?: string | undefined;
            shadows?: string | undefined;
            icons?: string[] | undefined;
            imagePlaceholders?: string[] | undefined;
            interactions?: string[] | undefined;
            responsiveBehavior?: string | undefined;
        } | null;
        generationPlan: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        } | null;
        generatedProject: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        } | null;
    }>;
    analysis: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        promptVersion: z.ZodString;
        schemaVersion: z.ZodString;
        inputTokens: z.ZodNumber;
        outputTokens: z.ZodNumber;
        latencyMs: z.ZodNumber;
        temperature: z.ZodNumber;
        generatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        provider: string;
        model: string;
        promptVersion: string;
        schemaVersion: string;
        inputTokens: number;
        outputTokens: number;
        latencyMs: number;
        temperature: number;
        generatedAt: string;
    }, {
        provider: string;
        model: string;
        promptVersion: string;
        schemaVersion: string;
        inputTokens: number;
        outputTokens: number;
        latencyMs: number;
        temperature: number;
        generatedAt: string;
    }>>;
    errors: z.ZodArray<z.ZodObject<{
        stage: z.ZodEnum<["upload_validation", "image_preparation", "design_analysis", "generation_plan_creation", "generation_plan_review", "react_project_generation", "schema_validation", "static_validation", "sandbox_compilation", "runtime_validation", "automatic_repair", "preview_ready"]>;
        code: z.ZodString;
        message: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        code: string;
        message: string;
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    }, {
        code: string;
        message: string;
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    }>, "many">;
    durations: z.ZodObject<{
        totalMs: z.ZodNumber;
        stages: z.ZodRecord<z.ZodString, z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        totalMs: number;
        stages: Record<string, number>;
    }, {
        totalMs: number;
        stages: Record<string, number>;
    }>;
}, "strip", z.ZodTypeAny, {
    status: "Queued" | "Uploading" | "Analyzing" | "Planning" | "Generating" | "Validating" | "Compiling" | "Repairing" | "Ready" | "Failed" | "Cancelled";
    stages: {
        status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
        startedAt?: string | undefined;
        completedAt?: string | undefined;
        durationMs?: number | undefined;
        errorCode?: string | undefined;
        errorMessage?: string | undefined;
    }[];
    imageId: string;
    projectId: string;
    id: string;
    activeStage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready" | null;
    outputs: {
        designAnalysis: {
            schemaVersion: "1";
            responseVersion: string;
            layoutHierarchy: string;
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
            }[];
            borders?: string | undefined;
            shadows?: string | undefined;
            icons?: string[] | undefined;
            imagePlaceholders?: string[] | undefined;
            interactions?: string[] | undefined;
            responsiveBehavior?: string | undefined;
        } | null;
        generationPlan: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        } | null;
        generatedProject: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        } | null;
    };
    analysis: {
        provider: string;
        model: string;
        promptVersion: string;
        schemaVersion: string;
        inputTokens: number;
        outputTokens: number;
        latencyMs: number;
        temperature: number;
        generatedAt: string;
    } | null;
    errors: {
        code: string;
        message: string;
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    }[];
    durations: {
        totalMs: number;
        stages: Record<string, number>;
    };
}, {
    status: "Queued" | "Uploading" | "Analyzing" | "Planning" | "Generating" | "Validating" | "Compiling" | "Repairing" | "Ready" | "Failed" | "Cancelled";
    stages: {
        status: "pending" | "running" | "completed" | "failed" | "skipped" | "cancelled";
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
        startedAt?: string | undefined;
        completedAt?: string | undefined;
        durationMs?: number | undefined;
        errorCode?: string | undefined;
        errorMessage?: string | undefined;
    }[];
    imageId: string;
    projectId: string;
    id: string;
    activeStage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready" | null;
    outputs: {
        designAnalysis: {
            schemaVersion: "1";
            responseVersion: string;
            layoutHierarchy: string;
            componentHierarchy: import("./design-analysis.js").ComponentNode[];
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
                value: string;
                name: string;
            }[];
            borders?: string | undefined;
            shadows?: string | undefined;
            icons?: string[] | undefined;
            imagePlaceholders?: string[] | undefined;
            interactions?: string[] | undefined;
            responsiveBehavior?: string | undefined;
        } | null;
        generationPlan: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            components: {
                type: string;
                name: string;
                purpose: string;
                props: {
                    type: string;
                    name: string;
                    required: boolean;
                    description: string;
                }[];
                children: boolean;
                dependencies: string[];
                accessibilityNotes: string;
            }[];
            files: {
                path: string;
                purpose: string;
                components: string[];
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
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
        } | null;
        generatedProject: {
            schemaVersion: "1";
            responseVersion: string;
            dependencies: Record<string, string>;
            files: {
                path: string;
                purpose: string;
                language: "tsx" | "ts" | "css" | "json" | "html" | "js";
                content: string;
                componentMetadata?: {
                    name: string;
                    purpose: string;
                    props: {
                        type: string;
                        name: string;
                        required: boolean;
                        description: string;
                    }[];
                    children: boolean;
                    dependencies: string[];
                    accessibilityNotes: string;
                } | undefined;
            }[];
            projectName: string;
            summary: string;
            entryFile: string;
            warnings: string[];
            devDependencies?: Record<string, string> | undefined;
            generationPlanRef?: string | undefined;
            designAnalysisRef?: string | undefined;
        } | null;
    };
    analysis: {
        provider: string;
        model: string;
        promptVersion: string;
        schemaVersion: string;
        inputTokens: number;
        outputTokens: number;
        latencyMs: number;
        temperature: number;
        generatedAt: string;
    } | null;
    errors: {
        code: string;
        message: string;
        stage: "upload_validation" | "image_preparation" | "design_analysis" | "generation_plan_creation" | "generation_plan_review" | "react_project_generation" | "schema_validation" | "static_validation" | "sandbox_compilation" | "runtime_validation" | "automatic_repair" | "preview_ready";
    }[];
    durations: {
        totalMs: number;
        stages: Record<string, number>;
    };
}>;
export type GenerationUserStatus = z.infer<typeof GenerationUserStatusSchema>;
export type CreateGenerationRequest = z.infer<typeof CreateGenerationRequestSchema>;
export type CreateGenerationResponse = z.infer<typeof CreateGenerationResponseSchema>;
export type GenerationStatusResponse = z.infer<typeof GenerationStatusResponseSchema>;
//# sourceMappingURL=generation-api.d.ts.map