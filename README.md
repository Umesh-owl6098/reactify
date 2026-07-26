# Reactify

Reactify converts UI screenshots into validated React + TypeScript + Tailwind projects using AI, browser-assisted Sandpack compilation, visual comparison against the source image, AI-assisted editing with immutable versions, and standalone ZIP export. Upload a design, review the generation plan, generate code, validate it in the browser, compare the result visually, refine it with natural-language edits, and export a production-ready Vite application.

![Reactify live preview](docs/screenshots/live-preview.png)

## Demo

| Generation plan | Live preview | Compare with Original |
| --- | --- | --- |
| ![Generation plan review](docs/screenshots/generation-plan.png) | ![Rendered live preview](docs/screenshots/live-preview.png) | ![Visual comparison](docs/screenshots/visual-comparison.png) |

| Edit with AI | Export project | Standalone output |
| --- | --- | --- |
| ![Edit with AI](docs/screenshots/edit-with-ai.png) | ![Export project](docs/screenshots/export-project.png) | ![Standalone output](docs/screenshots/standalone-output.png) |

The landing page and project history are shown below.

![Reactify home and project history](docs/screenshots/reactify-home.png)

## Key Features

- Screenshot upload and structured design analysis
- Generation-plan review before code generation
- OpenAI-powered React project generation
- React + TypeScript + Vite + Tailwind CSS output
- Browser-assisted Sandpack compilation and runtime validation
- Visible-DOM preview readiness checks
- Automatic repair for recoverable generation failures
- Immutable project versions with integrity hashing
- AI-assisted project edits with version history
- Visual comparison with side-by-side, overlay, and diff views
- Source-image aspect-ratio normalization
- Visual fidelity scoring and bounded correction workflow
- Standalone ZIP export of the active immutable version
- Durable export storage with restart-safe downloads
- Background worker jobs for generation, repair, export, edit, and comparison
- Retry, reconciliation, and stale-lock recovery
- Restart persistence for exports, versions, and generation state
- Authenticated, generation-scoped state isolation

## Architecture

Reactify is a pnpm + Turbo monorepo:

```text
Browser / React Web
        |
        v
Fastify API ---- PostgreSQL
        |
        v
Background Worker
        |
        +---- OpenAI
        +---- Sandpack validation
        +---- Visual comparison
        +---- Export preparation
```

Packages and apps:

- `apps/web` — React + Vite frontend, Sandpack preview, comparison capture, edit UI, export controls
- `apps/api` — Fastify API server, Prisma persistence, generation pipeline, export/comparison/edit services
- `apps/api/src/worker.ts` — background job runner for generation, repair, export, edit, and comparison jobs
- `packages/generation-contracts` — shared Zod schemas and generation contracts
- `packages/shared` — shared constants, errors, auth, and job/pipeline types
- `packages/ui` — shared UI components
- `packages/test-utils` — test helpers and fixtures
- `prisma/` — PostgreSQL schema and migrations
- `prompts/` — versioned AI prompt templates

## Generation Workflow

```text
Upload
→ Design Analysis
→ Plan Review
→ React Generation
→ Static Validation
→ Sandpack Compilation
→ Runtime / Visible DOM Validation
→ Automatic Repair if needed
→ Ready
→ Compare / Edit / Export
```

## Technology Stack

- React 18
- TypeScript 5.7
- Vite 6
- Tailwind CSS 3
- Fastify 5
- Prisma 6
- PostgreSQL 16
- Sandpack
- OpenAI
- Playwright
- Vitest
- pnpm workspaces
- Docker Compose for local PostgreSQL

## Reliability and Engineering Highlights

- Transient OpenAI retry handling and provider failure metadata
- Generation-scoped Zustand stores, React Query fetches, and API filtering
- Real preview readiness instead of compile-only success
- Durable immutable project versions with UUID-based version identity
- Project-integrity hashing and repair-version finalization
- Stale edit, export, and comparison lock reconciliation
- Durable ZIP downloads after API/worker restart
- Correct source-image aspect-ratio normalization for comparisons
- Record-level persistence upserts to avoid aggregate write races
- Playwright end-to-end coverage for preview, comparison, edit, export, and restart persistence

## Final Validation Results

Verified on generation `a1178bcb-8c58-4f0a-8884-d50082445368` (active version v12):

- 623 unit/integration tests passed across 130 test files
  - API: 426
  - Web: 179
  - Contracts: 10
  - Shared: 6
  - UI: 1
  - Test utilities: 1
- Playwright workflow suite: 9/9 passed
- Production build: 6/6 workspace packages passed
- Final visual similarity: 83.53%
- Zero high-severity comparison regions on the final validated comparison
- Standalone export installed, built, launched, and rendered
- Restart persistence passed for export download and generation state

## Prerequisites

- Node.js 20+
- pnpm 9+ via Corepack
- PostgreSQL 16
- Docker Desktop for the included local database container
- OpenAI API key for real AI generation

## Environment Setup

Copy the example environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set these values locally in `apps/api/.env`:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o
DATABASE_URL=postgresql://reactify:reactify_dev@localhost:5434/reactify
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174
```

Optional frontend overrides in `apps/web/.env`:

```bash
VITE_API_URL=http://localhost:3001
VITE_SANDPACK_BUNDLER_URL=
```

**Security note:** Never commit `.env` files, API keys, session secrets, or cookies. Credentials remain server-side only.

## Local Development

Install dependencies and generate the Prisma client:

```bash
corepack enable
corepack pnpm install
corepack pnpm db:generate
```

Start PostgreSQL:

```bash
docker compose up -d
corepack pnpm db:deploy
```

Run the full dev stack:

```bash
corepack pnpm dev
```

This starts:

- API on `http://localhost:3001`
- Web on `http://localhost:5174`
- Background worker polling for queued jobs

Health check:

```bash
curl http://localhost:3001/health
```

## Database Setup

Apply migrations:

```bash
corepack pnpm db:deploy
```

Create migrations during local development:

```bash
corepack pnpm db:migrate
```

Inspect the database:

```bash
corepack pnpm db:studio
```

## Testing

Run the workspace quality gates:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Run the browser workflow suite:

```bash
cd apps/web
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

The E2E suite expects a running API, worker, web app, PostgreSQL database, and a minted authenticated session created by `apps/api/scripts/create-e2e-session.ts`.

Capture demo screenshots for documentation:

```bash
cd apps/web
node scripts/capture-demo-screenshots.mjs
```

## Exported Project

ZIP exports are standalone Vite + React projects. After extracting an export:

```bash
npm install
npm run build
npm run preview
```

## Security

- Never commit `.env` files or API keys
- AI credentials remain on the API/worker only
- Generation records are owner-scoped
- Export download paths are validated
- Generated archives use controlled storage locations
- Secrets must be supplied through environment variables or your deployment platform

## Known Limitations

- OpenAI response time and availability can affect generation latency
- Sandpack runtime depends on bundler connectivity; telemetry timeouts are non-blocking
- Pixel-perfect reconstruction may still require visual correction for complex illustrations
- Production web builds may emit Vite chunk-size warnings
- Historical failed jobs and exports remain visible for audit purposes
- Comparison status may remain `correction_available` even when fidelity thresholds are acceptable

## Roadmap

- Improved visual fidelity for complex illustration sources
- Additional framework targets beyond Vite + React
- Team and project sharing
- Richer design-token extraction
- Optional self-hosted Sandpack bundler deployment
- Deployment automation and hosted demo environments

## License

No license file is included in this repository yet. All rights reserved by the repository owner unless a license is added explicitly.
