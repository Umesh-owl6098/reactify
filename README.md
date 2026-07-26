# Reactify

Reactify is an AI-powered screenshot-to-React platform. Upload a UI screenshot, review the generated plan, and produce a production-ready React + TypeScript + Vite project with live Sandpack preview, visual comparison against the source image, AI-assisted editing, and standalone ZIP export.

## Screenshot-to-React workflow

1. Upload a screenshot and create a generation.
2. Reactify analyzes the design and builds a structured generation plan.
3. The pipeline generates a React project, validates schema/static rules, compiles Tailwind CSS, and validates the project in Sandpack.
4. Preview the generated app in the browser once the preview is truly ready.
5. Compare the preview against the original screenshot.
6. Apply AI edits to create immutable project versions.
7. Export a standalone ZIP that installs, builds, and runs independently.

## Major features

- **Design analysis** with structured visual composition metadata
- **Generation planning** with user review before code generation
- **React project generation** for Vite + React + TypeScript projects
- **Live Sandpack preview** with real compile/runtime/DOM readiness checks
- **Visual comparison** with normalized screenshots, diff/overlay artifacts, and similarity metrics
- **AI project editing** with version history and sandbox revalidation
- **Standalone export** as a downloadable ZIP archive
- **Background jobs** for generation, repair, export, edit, and comparison work
- **Usage metering and pricing** for AI provider calls

## Architecture

Reactify is a pnpm + Turbo monorepo:

- `apps/web` — React + Vite frontend with Sandpack preview, comparison capture, edit UI, and export controls
- `apps/api` — Fastify API server and background worker
- `packages/generation-contracts` — shared Zod schemas and generation contracts
- `packages/shared` — shared constants, errors, and job/pipeline types
- `packages/ui` — shared UI components
- `packages/test-utils` — test helpers and fixtures
- `prisma/` — PostgreSQL schema and migrations
- `prompts/` — versioned AI prompt templates

Core backend flow:

- API routes accept authenticated requests and persist generation state in PostgreSQL.
- A worker process claims background jobs from the queue.
- The generation pipeline runs staged jobs for design analysis, planning, code generation, validation, repair, and recovery.
- Sandpack validation and browser preview readiness are tracked separately from simple compile success.
- Export and comparison artifacts are stored in local runtime storage and excluded from Git.

## Technology stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Sandpack
- **Backend:** Fastify, Prisma, PostgreSQL, background job runner
- **AI providers:** OpenAI and Anthropic (mock provider for tests)
- **Testing:** Vitest, Playwright, Turbo
- **Tooling:** pnpm workspaces, ESLint, Prettier, TypeScript

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (recommended for local PostgreSQL)
- GitHub CLI optional for repository management

## Environment setup

Copy the example environment files:

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Set these values locally in `apps/api/.env` using placeholders only in Git:

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o
DATABASE_URL=postgresql://reactify:reactify_dev@localhost:5434/reactify
```

Optional frontend overrides in `apps/web/.env`:

```bash
VITE_API_URL=http://localhost:3001
VITE_SANDPACK_BUNDLER_URL=
```

**Security note:** Never commit real API keys, session secrets, database passwords, cookies, or private keys. Keep secrets only in local `.env` files. The repository includes `.env.example` placeholders only.

## Local installation

```bash
corepack enable
corepack pnpm install
corepack pnpm db:generate
```

## Database setup

Start PostgreSQL:

```bash
docker compose up -d
```

Apply migrations:

```bash
corepack pnpm db:deploy
```

For local development with migration creation:

```bash
corepack pnpm db:migrate
```

## Development

Run the full dev stack (API, worker, and web):

```bash
corepack pnpm dev
```

Or run services individually:

```bash
corepack pnpm dev:api
corepack pnpm dev:worker
corepack pnpm dev:web
```

Default local URLs:

- Web: `http://localhost:5173`
- API: `http://localhost:3001`

Health check:

```bash
curl http://localhost:3001/health
```

## Quality gates

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

## Playwright end-to-end tests

The browser workflow test lives in `apps/web/e2e/`.

```bash
cd apps/web
corepack pnpm exec playwright install chromium
corepack pnpm test:e2e
```

E2E tests require a running API, worker, web app, PostgreSQL database, and a minted authenticated session created by the API helper script. Session state is stored locally under `apps/web/e2e/.auth/` and is ignored by Git.

## Generation workflow

Generation statuses include planning, generating, validating, repairing, awaiting sandbox validation, and ready. Reactify tracks separate eligibility for preview, comparison, edit, and export so the UI can explain why a feature is unavailable.

## Preview

Preview readiness requires:

- generated files loaded
- Sandpack mounted and connected
- successful compile and runtime
- preview iframe loaded
- non-empty visible DOM

Sandpack template resolution is derived from the generated Vite project rather than unsupported presets such as Create React App.

## Visual comparison

Comparison uses the source image aspect ratio, waits for real preview readiness, captures a browser screenshot, normalizes source and preview images, and stores overlay/diff artifacts with similarity metrics.

## AI edit

Edits create immutable version records, revalidate the updated project in Sandpack, and return the generation to `Ready` when validation succeeds.

## Export

Exports produce durable ZIP archives for the active immutable project version. Failed or stale export records do not block future exports.

## Known limitations

- Visual fidelity depends on provider quality and prompt coverage; some complex illustrations may still need manual refinement.
- Playwright E2E tests assume a prepared local database and dev stack.
- Runtime storage, screenshots, ZIP exports, and recovery artifacts are local-only and not part of the repository.
- Large frontend bundles may produce Vite chunk-size warnings during production build.

## License

Private application repository. All rights reserved unless otherwise specified by the repository owner.
