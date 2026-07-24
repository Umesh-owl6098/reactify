# Requirements: reactify-foundation

> **Status:** Draft  
> **Product:** Reactify — AI-Powered Frontend Engineering Platform  
> **Scope:** Foundation Release (v0.1)

---

## 1. Overview

Reactify converts UI screenshots into production-ready React applications. A user uploads a PNG, JPEG, or WebP screenshot, the platform sends it to Anthropic Claude Vision via a secure backend, receives a structured design analysis, generates a modular React + Tailwind project, validates the output, renders it in a browser sandbox (Sandpack), and lets the user inspect, edit, and export the result.

---

## 2. Goals

- Enable any developer to go from a UI screenshot to a runnable React codebase in one workflow.
- Keep AI provider credentials exclusively on the backend at all times.
- Guarantee that generated code only executes inside a browser sandbox, never on the server.
- Produce validated, schema-versioned output that is predictable and automatable.
- Ship a complete, testable vertical slice before layering on advanced features.

---

## 3. Non-Goals (Foundation Release)

- Billing or subscription management.
- Enterprise SSO or multi-user collaboration.
- Full Figma API integration.
- React Native or Next.js export targets.
- Visual similarity scoring against the original screenshot.
- Unrestricted npm package installation inside the sandbox.
- Distributed job queues or worker infrastructure.

---

## 4. Actors

| Actor | Description |
|-------|-------------|
| **Anonymous User** | Visitor with no account; identified by session token. |
| **Authenticated User** | Logged-in user with persistent projects and version history. |
| **Backend Service** | Node.js / Fastify API that orchestrates the generation pipeline. |
| **Claude Vision** | Anthropic API; external AI provider. |
| **Sandpack** | In-browser bundler and runtime; executes generated code. |

---

## 5. User Stories

### 5.1 Project Management

**US-001 — Create a Project**  
As a user, I want to create a named project, so that I can organise my screenshot-to-code conversions and revisit them later.

**US-002 — List My Projects**  
As an authenticated user, I want to see a list of all my projects sorted by last-modified date, so that I can quickly resume work.

**US-003 — Delete a Project**  
As an authenticated user, I want to delete a project and all its versions, so that I can manage my workspace.

---

### 5.2 Screenshot Upload

**US-004 — Upload a Screenshot**  
As a user, I want to upload a PNG, JPEG, or WebP screenshot via drag-and-drop or file picker, so that Reactify can analyse the design.

**US-005 — Preview the Screenshot**  
As a user, I want to see a preview of my uploaded screenshot before triggering generation, so that I can confirm the correct file was selected.

**US-006 — Reject Invalid Files**  
As a user, I want to receive a clear error message when I upload a file that is not a supported image type or exceeds the size limit, so that I understand what went wrong without exposing internal system details.

---

### 5.3 Design Analysis

**US-007 — Invoke Claude Vision**  
As a user, I want the system to send my screenshot to Claude Vision and receive a structured design analysis, so that accurate component and style data drives code generation.

**US-008 — View Design Analysis**  
As a user, I want to inspect the structured design analysis (layout, components, colours, typography, spacing, interactions) returned by Claude, so that I can understand what was detected.

---

### 5.4 Code Generation

**US-009 — Generate a React Project**  
As a user, I want the system to produce a modular, multi-file React + TypeScript + Tailwind project from the design analysis, so that I receive runnable, structured code.

**US-010 — View the Generated File Tree**  
As a user, I want to see a file tree listing every generated file, so that I can navigate the project structure.

**US-011 — Edit Generated Files**  
As a user, I want to edit any generated file in an inline code editor, so that I can adjust the output before exporting.

**US-011a — Review the Generation Plan**  
As a user, I want to see the Generation Plan before code is produced — including the planned component list, file structure, design token assignments, and styling approach — so that I can understand what is about to be built and optionally edit the plan before committing to full code generation.

**US-011b — Edit the Generation Plan**  
As a user, I want to edit the Generation Plan before triggering code generation, so that I can correct the AI's structural decisions (rename components, remove unneeded files, adjust token usage) without regenerating the full design analysis.

---

### 5.5 Sandbox Preview

**US-012 — Render in Sandpack**  
As a user, I want the generated project to be loaded into Sandpack and compiled in the browser, so that I see a live interactive preview without any server-side execution of untrusted code.

**US-013 — View Compilation Errors**  
As a user, I want to see compilation and runtime errors surfaced clearly in the UI, so that I know when generation failed to produce working code.

**US-014 — Automatic Repair**  
As a user, I want the system to attempt at least one automatic repair when compilation errors are detected, so that minor generation mistakes are corrected without manual intervention.

**US-015 — Responsive Preview Sizes**  
As a user, I want to switch the preview viewport between desktop (1280 px), tablet (768 px), and mobile (375 px), so that I can validate responsive behaviour.

---

### 5.6 Three-Panel Workspace

**US-016 — Three-Panel Layout**  
As a user, I want to see the original screenshot, the generated code, and the live preview side by side in resizable panels, so that I can compare the design and output simultaneously.

---

### 5.7 Versioning

**US-017 — Save a Project Version**  
As a user, I want successful generation results saved as immutable, numbered project versions, so that I can revisit any past state.

**US-018 — Switch Between Versions**  
As an authenticated user, I want to select and load any saved project version, so that I can compare or restore earlier outputs.

---

### 5.8 Export

**US-019 — Export as Vite ZIP**  
As a user, I want to download a runnable Vite React TypeScript project as a ZIP file, so that I can use the generated code in my own environment without any Reactify dependency.

---

## 6. Functional Requirements

### 6.1 Project Management

**REQ-001** — WHEN a user submits a valid project name (1–100 printable characters), THE SYSTEM SHALL create a project record, assign a UUID, and return the project object within 500 ms.

**REQ-002** — WHEN a user requests their project list, THE SYSTEM SHALL return all projects owned by that user sorted by `updatedAt` descending, paginated at 20 items per page.

**REQ-003** — WHEN a user deletes a project, THE SYSTEM SHALL soft-delete the project and cascade soft-delete all child versions, analyses, and generations.

---

### 6.2 Screenshot Upload & Validation

**REQ-004** — WHEN a file is submitted for upload, THE SYSTEM SHALL reject files whose declared or detected MIME type is not `image/png`, `image/jpeg`, or `image/webp` with HTTP 422 and error code `INVALID_MIME_TYPE`.

**REQ-005** — WHEN a file is submitted for upload, THE SYSTEM SHALL reject files exceeding 10 MB with HTTP 422 and error code `FILE_TOO_LARGE`.

**REQ-006** — WHEN a valid image is uploaded, THE SYSTEM SHALL return a signed preview URL and a stable `imageId` within 2 seconds.

**REQ-007** — THE SYSTEM SHALL validate image MIME type by inspecting the file's magic bytes on the backend, not solely by relying on the client-supplied `Content-Type` header.

---

### 6.3 Design Analysis

**REQ-008** — WHEN a generation is initiated, THE SYSTEM SHALL transmit the image to the Anthropic Claude Vision API exclusively from the backend service, never from the frontend client.

**REQ-009** — THE SYSTEM SHALL construct a structured prompt instructing Claude to return layout hierarchy, component hierarchy, colour palette, typography, spacing, borders, shadows, icon/image placeholders, interactions, and responsive behaviour.

**REQ-010** — WHEN Claude returns a response, THE SYSTEM SHALL validate it against a versioned Zod schema (`DesignAnalysisV1`) and reject malformed responses with error code `ANALYSIS_SCHEMA_INVALID`.

**REQ-011** — THE SYSTEM SHALL store the raw Claude response and the parsed `DesignAnalysis` record in the database, linked to the generation.

---

### 6.4 Generation Plan

**REQ-012a** — WHEN design analysis succeeds, THE SYSTEM SHALL produce a `GenerationPlan` before generating any React code. The `GenerationPlan` SHALL contain:
- `components[]` — each entry specifying `name`, `type`, `purpose`, `props`, `children`, `dependencies`, and `accessibilityNotes`
- `files[]` — each entry specifying `path`, `language`, `purpose`, and the component(s) it will contain
- `designTokens` — colours, typography scale, spacing scale, border radii, and shadow definitions derived from the `DesignAnalysis`
- `dependencies` — the complete set of npm packages required, pre-filtered against the allowlist
- `responsiveStrategy` — a plain-text description of how the layout adapts across desktop, tablet, and mobile
- `accessibilityStrategy` — a plain-text description of ARIA roles, landmark regions, focus management, and keyboard interactions planned for the output
- `confidenceWarnings[]` — any aspect of the design the AI could not confidently interpret, with a suggested fallback

**REQ-012b** — THE SYSTEM SHALL validate the `GenerationPlan` against a versioned Zod schema (`GenerationPlanV1`) before presenting it to the user or proceeding to code generation.

**REQ-012c** — THE SYSTEM SHALL persist the `GenerationPlan` as a database record linked to the `Generation`, with its own `id`, `schemaVersion`, and `createdAt`.

**REQ-012d** — WHEN a `GenerationPlan` has been produced, the generation SHALL pause at status `Planning` and present the plan to the user before proceeding. THE SYSTEM SHALL NOT begin React code generation until the user explicitly confirms or edits and confirms the plan.

**REQ-012e** — WHEN a user edits a `GenerationPlan`, THE SYSTEM SHALL validate the edited plan against `GenerationPlanV1` before accepting it. Invalid edits SHALL be rejected with inline field-level error messages. The edited plan SHALL replace the original and be persisted before generation proceeds.

---

### 6.5 Code Generation

**REQ-012** — WHEN a confirmed `GenerationPlan` exists, THE SYSTEM SHALL produce a `GeneratedProject` containing at minimum: `schemaVersion`, `projectName`, `summary`, `generationPlan` reference, `designAnalysis` reference, `dependencies`, `files[]`, `entryFile`, and `warnings[]`.

**REQ-013** — EACH generated file SHALL contain: `path`, `language`, `content`, and `purpose`.

**REQ-039** — EACH generated file whose `language` is `tsx` or `ts` and whose `purpose` is `component` SHALL additionally carry a `componentMetadata` object containing:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | PascalCase component name |
| `purpose` | `string` | One-sentence description of what the component renders or does |
| `props` | `PropDefinition[]` | Each prop's `name`, `type`, `required`, and `description` |
| `children` | `boolean` | Whether the component accepts and renders `children` |
| `dependencies` | `string[]` | Other generated components this component imports |
| `accessibilityNotes` | `string` | ARIA roles used, keyboard behaviour, and any known accessibility limitations |

**REQ-039a** — THE SYSTEM SHALL validate `componentMetadata` as part of `GeneratedProjectV1` schema validation. A component file missing required metadata fields SHALL cause the `schema_validation` stage to fail with error code `COMPONENT_METADATA_INVALID`.

**REQ-014** — THE SYSTEM SHALL validate the `GeneratedProject` against a versioned Zod schema (`GeneratedProjectV1`) before passing it to the sandbox.

**REQ-015** — Generated `dependencies` SHALL only include packages present on a server-side allowlist. THE SYSTEM SHALL strip or replace any dependency not on the allowlist and add a warning entry.

**REQ-016** — Generated file `path` values SHALL NOT contain `..`, absolute paths, or unknown remote import URLs. THE SYSTEM SHALL reject or sanitise any that do.

**REQ-017** — THE SYSTEM SHALL NOT use `eval`, `new Function`, or any dynamic code execution on the API server.

---

### 6.6 Generation Pipeline

The generation pipeline is organised around three first-class contracts produced in strict sequence. Each contract is independently validated before the next stage begins.

```
Screenshot
    │
    ▼
[Stage 1: upload_validation]
[Stage 2: image_preparation]
    │
    ▼  ── Contract 1 ──────────────────────────
    DesignAnalysis  (DesignAnalysisV1)
    │   layout, components, colors, typography,
    │   spacing, borders, shadows, interactions
    ▼  ──────────────────────────────────────────
[Stage 3: design_analysis]
[Stage 4: generation_plan_creation]
[Stage 5: generation_plan_review]   ← user gate
    │
    ▼  ── Contract 2 ──────────────────────────
    GenerationPlan  (GenerationPlanV1)
    │   components[], files[], designTokens,
    │   dependencies, responsiveStrategy,
    │   accessibilityStrategy, confidenceWarnings
    ▼  ──────────────────────────────────────────
[Stage 6: react_project_generation]
[Stage 7: schema_validation]
[Stage 8: static_validation]
    │
    ▼  ── Contract 3 ──────────────────────────
    GeneratedProject  (GeneratedProjectV1)
    │   files[], dependencies, entryFile,
    │   componentMetadata, warnings
    ▼  ──────────────────────────────────────────
[Stage 9:  sandbox_compilation]
[Stage 10: runtime_validation]
[Stage 11: automatic_repair]        ← conditional
[Stage 12: preview_ready]
```

**REQ-018** — THE SYSTEM SHALL execute generation through the following ordered stages, producing the three contracts at the points indicated:

1. `upload_validation` — validate image MIME type, magic bytes, and file size
2. `image_preparation` — encode image for AI transmission
3. `design_analysis` — invoke AI provider; produce and validate `DesignAnalysisV1`
4. `generation_plan_creation` — invoke AI provider with `DesignAnalysis`; produce and validate `GenerationPlanV1`
5. `generation_plan_review` — pause for user confirmation or editing of `GenerationPlan`
6. `react_project_generation` — invoke AI provider with confirmed `GenerationPlan`; produce raw `GeneratedProjectV1`
7. `schema_validation` — validate `GeneratedProjectV1` against Zod schema
8. `static_validation` — check dependency allowlist, path safety, and component metadata completeness
9. `sandbox_compilation` — load files into Sandpack; capture compilation errors
10. `runtime_validation` — capture runtime errors from Sandpack
11. `automatic_repair` — conditional; apply `ProjectPatchV1` to resolve errors (up to max attempts)
12. `preview_ready` — generation complete; create `ProjectVersion`

**REQ-019** — The overall generation SHALL carry exactly one of the following user-visible status values at any point in time:

| Status | Meaning |
|------------|-------------------------------------------------------------------------|
| `Queued` | Generation accepted; no stage has started yet. |
| `Uploading` | Image is being transferred and validated on the server. |
| `Analyzing` | Claude Vision is analysing the screenshot. |
| `Planning` | Component hierarchy and design tokens are being planned. |
| `Generating` | React project files are being produced. |
| `Validating` | Zod schema and static safety checks are running. |
| `Compiling` | Sandpack is bundling the project in the browser. |
| `Repairing` | An automatic repair attempt is in progress. |
| `Ready` | Preview is live; generation succeeded. |
| `Failed` | A stage encountered an unrecoverable error. |
| `Cancelled` | The user cancelled the generation. |

Each individual pipeline stage record SHALL additionally carry an internal status of `pending`, `running`, `completed`, `failed`, `skipped`, or `cancelled` for audit and debugging purposes. The user-visible status above is derived from the active stage and its outcome.

**REQ-020** — WHEN the generation status transitions to `Failed`, THE SYSTEM SHALL record the responsible stage name, error code, human-readable message, and timestamp, and surface them to the user.

**REQ-021** — WHEN a user cancels a generation, THE SYSTEM SHALL transition the overall status to `Cancelled` and mark all internal stage records that are `pending` or `running` as `cancelled`.

---

### 6.6 Sandbox

**REQ-022** — THE SYSTEM SHALL load the `GeneratedProject` files into Sandpack running entirely in the browser. No generated code SHALL execute on the API server.

**REQ-023** — WHEN Sandpack reports a compilation error, THE SYSTEM SHALL capture the error message, the offending file path, and the line number and display them to the user.

**REQ-024** — WHEN Sandpack reports a runtime error, THE SYSTEM SHALL capture the error type and stack trace and display them to the user.

**REQ-025** — THE SYSTEM SHALL attempt automatic repair when compilation errors are detected. Each attempt SHALL be recorded as a `RepairAttempt` entity containing: attempt number, error input, repair prompt, AI-returned confidence score (0.0–1.0), and outcome.

**REQ-025a** — WHEN the maximum repair attempt count (default 3, configurable) is reached without resolving all errors, THE SYSTEM SHALL halt the repair loop and transition the generation to `failed` with error code `REPAIR_EXHAUSTED`.

**REQ-025b** — WHEN the set of active compilation errors on attempt N is identical to the set on attempt N-1 (same error codes, files, and line numbers), THE SYSTEM SHALL halt the repair loop immediately with error code `REPAIR_LOOP_DETECTED`, regardless of remaining attempts.

**REQ-025c** — WHEN the AI provider returns a confidence score below the configured threshold (default 0.4) for a repair response, THE SYSTEM SHALL halt the repair loop with error code `REPAIR_LOW_CONFIDENCE` rather than applying the patch.

**REQ-026** — WHEN the repair loop halts for any reason (`REPAIR_EXHAUSTED`, `REPAIR_LOOP_DETECTED`, or `REPAIR_LOW_CONFIDENCE`), THE SYSTEM SHALL surface a final error state to the user that includes: the halt reason, the last known error details, and the number of attempts made.

---

### 6.7 Three-Panel Workspace

**REQ-027** — THE SYSTEM SHALL render the workspace as three resizable panels: (1) original screenshot, (2) generated code editor with file tree, (3) live Sandpack preview.

**REQ-028** — The resizable panels SHALL be implemented using a maintained library (e.g. `react-resizable-panels`). Panel sizes SHALL persist in local storage per project.

**REQ-029** — WHEN the user drags a panel divider, THE SYSTEM SHALL reflow all three panels without layout jank or panel collapse below a minimum width of 200 px.

---

### 6.8 Responsive Preview

**REQ-030** — THE SYSTEM SHALL provide a viewport switcher with three named presets: Desktop (1280 px), Tablet (768 px), Mobile (375 px).

**REQ-031** — WHEN the user selects a viewport preset, THE SYSTEM SHALL resize the Sandpack preview iframe to the corresponding width within 100 ms.

---

### 6.9 Versioning

**REQ-032** — WHEN a generation reaches `preview_ready`, THE SYSTEM SHALL create an immutable `ProjectVersion` record containing:
- the full `GeneratedProject` snapshot
- the `DesignAnalysis` snapshot
- a sequential version number (1-based, per project)
- a creation timestamp
- `parentVersionId` — the UUID of the preceding version, or `null` for the first version
- `changeSummary` — a human-readable description of what changed relative to the parent (e.g. "Repaired 2 compilation errors", "Regenerated from new screenshot")
- `changedFiles` — an array of file-level diff entries, each containing `path`, `changeType` (`added` | `modified` | `deleted`), and for `modified` entries a unified diff string

**REQ-033** — `ProjectVersion` records SHALL be immutable. THE SYSTEM SHALL reject any attempt to mutate `projectSnapshot`, `analysisSnapshot`, `parentVersionId`, `changeSummary`, `changedFiles`, or `versionNumber` after creation.

**REQ-034** — WHEN a user loads a saved version, THE SYSTEM SHALL restore the exact file set and design analysis associated with that version.

**REQ-035a** — WHEN computing `changedFiles` for a new version, THE SYSTEM SHALL diff each file in the new `GeneratedProject` against the corresponding file in the parent version's snapshot. Files present only in the new version SHALL be marked `added`; files absent from the new version SHALL be marked `deleted`; files with differing content SHALL be marked `modified` with a unified diff. IF there is no parent version, all files SHALL be marked `added`.

**REQ-035b** — WHEN a user views the version history, THE SYSTEM SHALL display the version list with `versionNumber`, `createdAt`, `changeSummary`, and the count of added, modified, and deleted files per version.

---

### 6.10 Export

**REQ-035** — WHEN a user requests export, THE SYSTEM SHALL package the generated files into a Vite React TypeScript project structure and return it as a ZIP file with MIME type `application/zip`.

**REQ-036** — The exported ZIP SHALL include: `package.json` (with pinned dependency versions), `vite.config.ts`, `tsconfig.json`, `index.html`, `tailwind.config.js`, `postcss.config.js`, and all generated source files.

**REQ-037** — The exported ZIP SHALL NOT include any Reactify runtime dependencies, credentials, or internal configuration.

---

### 6.11 Patch Contract

**REQ-038** — WHEN the AI provider returns modifications to an existing project (during repair, plan editing, or future inline editing), THE SYSTEM SHALL require those modifications to be expressed as a structured `ProjectPatch` rather than arbitrary full-file replacements wherever possible. A `ProjectPatch` SHALL be an ordered array of patch operations, each carrying a `type` field with one of the following values:

| Operation | Description |
|---|---|
| `ADD_FILE` | Create a new file at `path` with the given `content`, `language`, and `purpose`. SHALL fail if the path already exists. |
| `UPDATE_FILE` | Replace the full content of an existing file at `path`. SHALL fail if the path does not exist. |
| `DELETE_FILE` | Remove the file at `path` from the project. SHALL fail if the path does not exist. |
| `UPDATE_DEPENDENCY` | Add, update, or remove an entry in `dependencies` or `devDependencies`. The operation SHALL specify `package`, `version` (omit to remove), and `dev` (boolean). |

**REQ-038a** — THE SYSTEM SHALL validate every `ProjectPatch` against a versioned Zod schema (`ProjectPatchV1`) before applying any operation. IF any operation in the patch fails validation, THE SYSTEM SHALL reject the entire patch with error code `PATCH_SCHEMA_INVALID` and apply no changes.

**REQ-038b** — THE SYSTEM SHALL apply `ProjectPatch` operations atomically. IF any individual operation fails (e.g. `ADD_FILE` on an existing path), THE SYSTEM SHALL roll back all preceding operations in the same patch and surface error code `PATCH_APPLY_FAILED` with the failing operation index.

**REQ-038c** — File paths in `ADD_FILE` and `UPDATE_FILE` operations SHALL be subject to the same path safety rules defined in REQ-016. Packages in `UPDATE_DEPENDENCY` operations SHALL be subject to the allowlist rules defined in REQ-015.

---

## 7. Non-Functional Requirements

### 7.1 Security

**REQ-S01** — THE SYSTEM SHALL store the Anthropic API key exclusively as a server-side environment variable. It SHALL NOT be exposed in any API response, browser environment, log entry, or frontend bundle.

**REQ-S02** — THE SYSTEM SHALL NOT log complete base64-encoded image data. Image references in logs SHALL use the `imageId` only.

**REQ-S03** — THE SYSTEM SHALL apply rate limiting of no more than 10 generation requests per user per minute. Requests exceeding the limit SHALL receive HTTP 429.

**REQ-S04** — THE SYSTEM SHALL apply explicit CORS policy, allowing only the configured frontend origin(s). Requests from unlisted origins SHALL be rejected with HTTP 403.

**REQ-S05** — THE SYSTEM SHALL set a 60-second request timeout on all calls to the Anthropic API. Timeouts SHALL surface as error code `AI_TIMEOUT`.

**REQ-S06** — THE SYSTEM SHALL validate all user-supplied file paths in generated code against a strict allowlist pattern (relative paths only, no `..`, no absolute paths, no remote URLs).

**REQ-S07** — THE SYSTEM SHALL use parameterised queries (via Prisma) for all database operations. Raw SQL interpolation of user input is prohibited.

**REQ-S08** — All HTTP responses from the API SHALL include security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.

**REQ-S09** — No package in the monorepo's dependency graph SHALL execute arbitrary shell commands during installation. THE SYSTEM SHALL enforce this by:
- Configuring the package manager to ignore all `postinstall`, `install`, and `preinstall` lifecycle scripts (e.g. via `.npmrc` `ignore-scripts=true` or equivalent).
- Prohibiting packages that require native addons (`.node` binaries compiled via `node-gyp` or equivalent).
- Flagging any dependency that declares a lifecycle script in its `package.json` as a required manual review step before merging.

**REQ-S10** — THE SYSTEM SHALL enforce REQ-S09 in CI. WHEN a dependency with a lifecycle script or native addon is detected, the CI pipeline SHALL fail with a clear error identifying the offending package before any code is installed or executed.

---

### 7.2 Performance

**REQ-P01** — End-to-end generation (upload → preview ready) SHOULD complete within 30 seconds for a typical screenshot under normal load.

**REQ-P02** — The frontend initial load (LCP) SHALL be under 2.5 seconds on a simulated 4G connection.

**REQ-P03** — Sandpack compilation SHALL begin rendering within 3 seconds of receiving the generated file set.

**REQ-P04** — API health endpoint SHALL respond within 100 ms under normal load.

---

### 7.3 Accessibility

**REQ-A01** — All interactive controls SHALL meet WCAG 2.1 AA contrast requirements (minimum 4.5:1 for normal text, 3:1 for large text).

**REQ-A02** — All image elements SHALL have meaningful `alt` text or `aria-label`. The screenshot preview SHALL include a descriptive `alt` attribute.

**REQ-A03** — The application SHALL be keyboard-navigable. Focus order SHALL follow the visual reading order. No keyboard traps SHALL be present.

**REQ-A04** — Error messages SHALL be announced to screen readers via `aria-live` regions.

**REQ-A05** — The resizable panel dividers SHALL be operable via keyboard (arrow keys) and announce their current size to assistive technologies.

---

### 7.4 Reliability

**REQ-R01** — THE SYSTEM SHALL handle Claude API errors (5xx, network timeouts, malformed JSON) gracefully, returning a structured error response rather than an unhandled exception.

**REQ-R02** — THE SYSTEM SHALL handle Sandpack runtime errors without crashing the host application.

**REQ-R03** — THE SYSTEM SHALL be idempotent for generation retries: submitting the same `imageId` and project context twice SHALL create a new generation rather than duplicate data.

---

### 7.5 Observability

**REQ-O01** — THE SYSTEM SHALL emit structured JSON logs for every pipeline stage transition, including `generationId`, `stage`, `status`, `durationMs`, and `errorCode` (if applicable).

**REQ-O02** — THE SYSTEM SHALL expose a `/health` endpoint returning `{ status: "ok", version: string, timestamp: string }` for uptime monitoring.

**REQ-O03** — THE SYSTEM SHALL track and log repair attempt outcomes (success/failure, attempt number, error type).

**REQ-040** — THE SYSTEM SHALL record the following AI cost and performance fields on every `Generation` record after each AI provider call completes:

| Field | Type | Description |
|---|---|---|
| `inputTokens` | `integer` | Number of tokens in the prompt sent to the AI provider |
| `outputTokens` | `integer` | Number of tokens in the AI provider's response |
| `estimatedCostUsd` | `decimal(10,6)` | Estimated cost in USD, computed from provider-published token prices at request time |
| `aiLatencyMs` | `integer` | Wall-clock time from the start of the AI call to receipt of the complete response |

**REQ-040a** — WHEN a generation involves multiple AI calls (e.g. analysis + repair attempts), THE SYSTEM SHALL record per-call cost fields on each `RepairAttempt` record in addition to the aggregate on `Generation`. The `Generation` aggregate SHALL sum `inputTokens`, `outputTokens`, and `estimatedCostUsd` across all calls in the generation.

**REQ-040b** — Cost fields SHALL be surfaced in the generation status response so that the frontend can display them to the user. They SHALL NOT be treated as sensitive data.

---

### 7.6 Maintainability

**REQ-M01** — All shared TypeScript contracts (Zod schemas, types, interfaces) SHALL live in the `packages/generation-contracts` package and be imported by both `apps/web` and `apps/api`.

**REQ-M02** — The generation pipeline SHALL be implemented as a linear state machine where each stage is an independently testable function.

**REQ-M03** — The `GeneratedProject` Zod schema SHALL be versioned (e.g. `GeneratedProjectV1`). Incompatible changes SHALL increment the version.

**REQ-M04** — Every public API endpoint SHALL have an OpenAPI-compatible schema definition co-located with the route handler.

**REQ-M05** — THE SYSTEM SHALL access the AI provider exclusively through an `AIProvider` interface. Anthropic Claude SHALL be the initial implementation. The interface SHALL be designed so that alternative providers (OpenAI, Gemini, Azure OpenAI, local models) can be substituted by supplying a different implementation without modifying any pipeline business logic, route handler, or data model.

**REQ-M06** — Every generation SHALL store the following AI invocation metadata to allow reproducibility: `promptVersion`, `provider`, `model`, `temperature`, and `generationTimestamp`. This data SHALL be persisted on the `Generation` record and included in the `ProjectVersion` snapshot.

**REQ-M07** — WHEN the AI provider returns a response, THE SYSTEM SHALL verify the presence of `schemaVersion` and `responseVersion` fields before executing any Zod schema validation. IF either field is absent or unrecognised, THE SYSTEM SHALL reject the response with error code `AI_RESPONSE_VERSION_MISSING` and abort the pipeline stage without attempting further parsing.

**REQ-M08** — All prompts sent to the AI provider SHALL be stored as discrete, versioned Markdown files in a top-level `prompts/` directory in the repository. The required prompt files for the foundation release are:

| File | Purpose |
|---|---|
| `prompts/design-analysis.md` | Instructs the AI to produce a `DesignAnalysisV1` JSON object from a screenshot |
| `prompts/generation-plan.md` | Instructs the AI to produce a `GenerationPlanV1` JSON object from a `DesignAnalysis` |
| `prompts/generation.md` | Instructs the AI to produce a `GeneratedProjectV1` JSON object from a `GenerationPlan` |
| `prompts/repair.md` | Instructs the AI to produce a `ProjectPatchV1` from a set of compilation errors and current files |

Each prompt file SHALL include a front-matter block containing `promptVersion` (semver string) and `schemaVersion` (the contract version it targets). THE SYSTEM SHALL read the `promptVersion` from the file at runtime and record it on the `Generation` record per REQ-M06. Prompt changes SHALL be committed as a versioned change in source control; no prompt content SHALL be hardcoded in application source files.

**REQ-M09** — THE SYSTEM SHALL support the following named feature flags, resolvable at runtime without redeployment (e.g. via environment variables or a configuration file):

| Flag | Default | Controls |
|---|---|---|
| `enableRepair` | `true` | Whether the automatic repair loop runs after compilation errors |
| `enableInspector` | `true` | Whether the component inspector panel is available in the workspace |
| `enableAccessibility` | `true` | Whether accessibility analysis and `accessibilityNotes` on components are generated |
| `enableGenerationPlanEditing` | `true` | Whether the user can edit the `GenerationPlan` before code generation proceeds |

WHEN a feature flag is set to `false`, THE SYSTEM SHALL skip the corresponding pipeline stage(s) or hide the corresponding UI affordance gracefully. Flag state SHALL be logged on each generation for reproducibility.

---

## 8. Core Entities (Conceptual)

| Entity | Description |
|--------|-------------|
| `User` | Authenticated user account or anonymous session. |
| `Project` | Named container owned by a user; holds generations and versions. |
| `DesignAnalysis` | Parsed structured output from Claude Vision. |
| `Generation` | One run of the full pipeline for a given project + image. |
| `ProjectVersion` | Immutable snapshot of a successful generation. |
| `RepairAttempt` | One automatic repair cycle within a generation. |
| `GenerationPlan` | AI-produced plan reviewed and confirmed by the user before code generation. |
| `ComponentMetadata` | Structured metadata embedded in each generated component file. |
| `AnalysisReport` | Audit log of validation checks performed on a generation. |
| `SavedComponent` | (Post-foundation) reusable component extracted from a generation. |

---

## 9. Constraints & Assumptions

- The Anthropic Claude API is available and the API key is provisioned before deployment.
- Sandpack is used as the exclusively client-side bundler; no server-side rendering of generated code.
- PostgreSQL is the only supported database for the foundation release.
- The monorepo is managed with a single `package.json` workspace root (npm/pnpm/yarn workspaces).
- Generated React code targets React 18 and Tailwind CSS v3.
- The dependency allowlist is maintained as a static configuration file on the server.
- Anonymous users may use the tool but versions are only persisted if the user is authenticated or a session token is maintained.
