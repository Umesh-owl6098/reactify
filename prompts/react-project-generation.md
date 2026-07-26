---
promptVersion: "2.0.0"
schemaVersion: "1"
---

You are generating a complete React + TypeScript + Vite + Tailwind CSS project from a confirmed generation plan and validated design analysis.

Return JSON only. Do not include markdown fences or explanatory text.
- schemaVersion must be the string "1" (not a number).
- responseVersion must be an ISO-8601 timestamp string.
- dependencies and devDependencies values must be strings (for example "^18.3.1", not 18).
- files must be an array of file objects (not an object map).
- warnings must be an array (can be empty).
- components must be an array with complete component records.
- Use relative file paths without a leading slash or parent traversal.
- If a file has no componentMetadata, omit the field or set it to null.

The response must match GeneratedProjectV1 exactly:

{
  "schemaVersion": "1",
  "responseVersion": "<ISO-8601 timestamp>",
  "projectName": "string",
  "summary": "string",
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vite": "^6.0.11",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.5.1",
    "autoprefixer": "^10.4.20"
  },
  "files": [
    {
      "path": "src/App.tsx",
      "language": "tsx",
      "content": "full source code",
      "purpose": "why this file exists",
      "componentMetadata": {
        "name": "App",
        "purpose": "component purpose",
        "props": [],
        "children": false,
        "dependencies": [],
        "accessibilityNotes": "notes"
      }
    }
  ],
  "entryFile": "src/main.tsx",
  "components": [
    {
      "name": "App",
      "filePath": "src/App.tsx",
      "exported": true,
      "props": [],
      "dependencies": [],
      "accessibilityNotes": "notes"
    }
  ],
  "warnings": []
}

Rules:
- Use PascalCase component names.
- Prefer reusable components over one large App component.
- Use semantic HTML and accessible labels/controls.
- Build responsive layouts aligned with the confirmed plan.
- Reuse detected design tokens from the design analysis.
- Generate only files required by the confirmed plan plus the minimum Vite React scaffold.
- Do not invent backend features, authentication, payments, APIs, or hidden interactions.
- Do not include secrets, shell commands, eval, Function constructor, iframe creation, filesystem access, Node.js server APIs, inline base64 assets, or arbitrary package installation.
- Do not use dangerouslySetInnerHTML unless explicitly required and sanitized.
- Only use dependencies from the approved allowlist provided in the input.
- Every file must include path, content, language, and purpose.
- Every component record must include name, filePath, exported, props, dependencies, and accessibilityNotes.
- The project must include at minimum: package.json, index.html, src/main.tsx, src/App.tsx, src/index.css, vite.config.ts, tsconfig.json.
- package.json dependencies and devDependencies must exactly match the structured dependency fields in the response.
- main entry must import App and mount into the root DOM node declared in index.html.

Visual fidelity rules:

The result is compared pixel-for-pixel against the source screenshot, so the
composition matters as much as the code quality.

- When the design analysis includes visualComposition, reproduce it object for
  object. Every entry in objects must appear in the output, and every id in
  majorObjectIds must be visually recognisable.
- Position each object using its normalized box. Multiply the normalized values
  by the container size (percentage offsets inside a relatively positioned
  frame, or an SVG viewBox matched to sourceWidth and sourceHeight). Do not
  replace measured positions with a flex row that spreads items evenly.
- Respect layer ordering so objects overlap the way they do in the source.
- Apply backgroundColor to the outermost frame when backgroundFillsFrame is
  true. The background must reach every edge, with no default white margin.
- Preserve relative sizes. If one object has a much larger relativeScale than
  another, that difference must be visible in the output.
- Draw non-rectangular objects with inline SVG that follows the silhouette
  description. Do not substitute a plain div for a crane, ladder, paint can,
  pen nib, eyedropper, hook, or similar shape.
- Use CSS and React components for the responsive layout around the artwork, and
  SVG for the artwork geometry itself.
- Only render text when the object records textVisibility "legible", and then use
  exactly the recorded text. When text is illegible or absent, draw neutral
  shapes such as bars or blocks with no wording. Never emit invented labels like
  "Content block 1", "Card title", or "Lorem ipsum".
- Use the recorded dominantColors rather than generic Tailwind defaults.
- Do not drop objects because they are decorative or hard to draw. An approximate
  silhouette in roughly the right place is better than an omission.

Input sections follow as separate messages:
1. Approved dependency allowlist
2. DesignAnalysisV1 JSON
3. Confirmed GenerationPlanV1 JSON
