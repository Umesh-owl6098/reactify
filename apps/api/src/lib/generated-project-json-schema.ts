/**
 * OpenAI strict JSON schema for GeneratedProjectV1.
 * Matches packages/generation-contracts/src/generated-project.ts.
 */
const propDefinition = {
  type: "object",
  properties: {
    name: { type: "string" },
    type: { type: "string" },
    required: { type: "boolean" },
    description: { type: "string" },
  },
  required: ["name", "type", "required", "description"],
  additionalProperties: false,
} as const;

const componentMetadata = {
  type: "object",
  properties: {
    name: { type: "string" },
    purpose: { type: "string" },
    props: { type: "array", items: propDefinition },
    children: { type: "boolean" },
    dependencies: { type: "array", items: { type: "string" } },
    accessibilityNotes: { type: "string" },
  },
  required: ["name", "purpose", "props", "children", "dependencies", "accessibilityNotes"],
  additionalProperties: false,
} as const;

const generatedFile = {
  type: "object",
  properties: {
    path: { type: "string" },
    language: { type: "string", enum: ["tsx", "ts", "css", "json", "html", "js"] },
    content: { type: "string" },
    purpose: { type: "string" },
    componentMetadata: {
      anyOf: [componentMetadata, { type: "null" }],
    },
  },
  required: ["path", "language", "content", "purpose", "componentMetadata"],
  additionalProperties: false,
} as const;

const generatedComponentRecord = {
  type: "object",
  properties: {
    name: { type: "string" },
    filePath: { type: "string" },
    exported: { type: "boolean" },
    props: { type: "array", items: propDefinition },
    dependencies: { type: "array", items: { type: "string" } },
    accessibilityNotes: { type: "string" },
  },
  required: ["name", "filePath", "exported", "props", "dependencies", "accessibilityNotes"],
  additionalProperties: false,
} as const;

const runtimeDependencies = {
  type: "object",
  properties: {
    react: { type: "string" },
    "react-dom": { type: "string" },
  },
  required: ["react", "react-dom"],
  additionalProperties: false,
} as const;

const devDependenciesObject = {
  type: "object",
  properties: {
    typescript: { type: "string" },
    vite: { type: "string" },
    "@vitejs/plugin-react": { type: "string" },
    tailwindcss: { type: "string" },
    postcss: { type: "string" },
    autoprefixer: { type: "string" },
  },
  required: ["typescript", "vite", "@vitejs/plugin-react", "tailwindcss", "postcss", "autoprefixer"],
  additionalProperties: false,
} as const;

export const GENERATED_PROJECT_V1_JSON_SCHEMA = {
  type: "object",
  properties: {
    schemaVersion: { type: "string", enum: ["1"] },
    responseVersion: { type: "string" },
    projectName: { type: "string" },
    summary: { type: "string" },
    generationPlanRef: { anyOf: [{ type: "string" }, { type: "null" }] },
    designAnalysisRef: { anyOf: [{ type: "string" }, { type: "null" }] },
    dependencies: runtimeDependencies,
    devDependencies: {
      anyOf: [devDependenciesObject, { type: "null" }],
    },
    files: {
      type: "array",
      minItems: 1,
      items: generatedFile,
    },
    entryFile: { type: "string" },
    components: {
      type: "array",
      items: generatedComponentRecord,
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "schemaVersion",
    "responseVersion",
    "projectName",
    "summary",
    "generationPlanRef",
    "designAnalysisRef",
    "dependencies",
    "devDependencies",
    "files",
    "entryFile",
    "components",
    "warnings",
  ],
  additionalProperties: false,
} as const;

export const GENERATED_PROJECT_V1_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "generated_project_v1",
  schema: GENERATED_PROJECT_V1_JSON_SCHEMA,
  strict: true,
};

export const GENERATED_PROJECT_V1_JSON_OBJECT_FORMAT = {
  type: "json_object" as const,
};
