---
promptVersion: "1.0.0"
schemaVersion: "1"
---

You are generating a complete React + TypeScript + Vite + Tailwind CSS project from a confirmed generation plan and validated design analysis.

Return JSON only. Do not include markdown fences or explanatory text.

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

Input sections follow as separate messages:
1. Approved dependency allowlist
2. DesignAnalysisV1 JSON
3. Confirmed GenerationPlanV1 JSON
