/**
 * OpenAI strict JSON schema for DesignAnalysisV1.
 *
 * Keep enum values aligned with VisualObjectKindSchema. Optional contract
 * fields are required here but nullable so strict structured output can
 * constrain every object property without weakening runtime Zod validation.
 */
const nullableString = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const componentNode = {
  type: "object",
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    description: { type: "string" },
    props: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    children: {
      type: "array",
      items: { $ref: "#/$defs/componentNode" },
    },
    interactions: {
      type: "array",
      items: { type: "string" },
    },
    responsive: nullableString,
  },
  required: ["id", "type", "description", "props", "children", "interactions", "responsive"],
  additionalProperties: false,
} as const;

const visualObject = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: {
      type: "string",
      enum: [
        "device",
        "tool",
        "decoration",
        "text",
        "control",
        "surface",
        "illustration",
        "chart",
        "background",
      ],
    },
    box: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    layer: { type: "number" },
    silhouette: { type: "string" },
    rotationDegrees: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    relativeScale: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    dominantColors: {
      type: "array",
      items: { type: "string" },
    },
    subComponents: {
      type: "array",
      items: { type: "string" },
    },
    textVisibility: {
      type: "string",
      enum: ["legible", "partially_legible", "illegible", "none"],
    },
    text: nullableString,
    connectedTo: {
      type: "array",
      items: { type: "string" },
    },
    responsiveBehavior: nullableString,
    confidence: { type: "number" },
  },
  required: [
    "id",
    "name",
    "kind",
    "box",
    "layer",
    "silhouette",
    "rotationDegrees",
    "relativeScale",
    "dominantColors",
    "subComponents",
    "textVisibility",
    "text",
    "connectedTo",
    "responsiveBehavior",
    "confidence",
  ],
  additionalProperties: false,
} as const;

export const DESIGN_ANALYSIS_V1_JSON_SCHEMA = {
  type: "object",
  $defs: {
    componentNode,
  },
  properties: {
    schemaVersion: { type: "string", enum: ["1"] },
    responseVersion: { type: "string" },
    layoutHierarchy: { type: "string" },
    componentHierarchy: {
      type: "array",
      items: { $ref: "#/$defs/componentNode" },
    },
    colors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          hex: { type: "string" },
          usage: nullableString,
        },
        required: ["name", "hex", "usage"],
        additionalProperties: false,
      },
    },
    typography: {
      type: "array",
      items: {
        type: "object",
        properties: {
          element: { type: "string" },
          fontFamily: { type: "string" },
          fontSize: { type: "string" },
          fontWeight: { type: "string" },
          lineHeight: nullableString,
          letterSpacing: nullableString,
        },
        required: [
          "element",
          "fontFamily",
          "fontSize",
          "fontWeight",
          "lineHeight",
          "letterSpacing",
        ],
        additionalProperties: false,
      },
    },
    spacing: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          value: { type: "string" },
        },
        required: ["name", "value"],
        additionalProperties: false,
      },
    },
    borders: nullableString,
    shadows: nullableString,
    icons: {
      type: "array",
      items: { type: "string" },
    },
    imagePlaceholders: {
      type: "array",
      items: { type: "string" },
    },
    interactions: {
      type: "array",
      items: { type: "string" },
    },
    responsiveBehavior: nullableString,
    visualComposition: {
      type: "object",
      properties: {
        schemaVersion: { type: "string", enum: ["1"] },
        sourceWidth: { type: "number" },
        sourceHeight: { type: "number" },
        backgroundColor: { type: "string" },
        backgroundFillsFrame: { type: "boolean" },
        objects: {
          type: "array",
          items: visualObject,
        },
        majorObjectIds: {
          type: "array",
          items: { type: "string" },
        },
        notes: nullableString,
      },
      required: [
        "schemaVersion",
        "sourceWidth",
        "sourceHeight",
        "backgroundColor",
        "backgroundFillsFrame",
        "objects",
        "majorObjectIds",
        "notes",
      ],
      additionalProperties: false,
    },
  },
  required: [
    "schemaVersion",
    "responseVersion",
    "layoutHierarchy",
    "componentHierarchy",
    "colors",
    "typography",
    "spacing",
    "borders",
    "shadows",
    "icons",
    "imagePlaceholders",
    "interactions",
    "responsiveBehavior",
    "visualComposition",
  ],
  additionalProperties: false,
} as const;

export const DESIGN_ANALYSIS_V1_RESPONSE_FORMAT = {
  type: "json_schema" as const,
  name: "design_analysis_v1",
  schema: DESIGN_ANALYSIS_V1_JSON_SCHEMA,
  strict: true,
};
