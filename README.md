# Reactify

AI-powered platform for converting UI screenshots into production-ready React applications.

## Prerequisites

- Node.js 20+
- pnpm 9+

## Local setup

```bash
pnpm install
pnpm build
```

## Development

Run the full monorepo in dev mode (web + API + package watchers):

```bash
pnpm dev
```

Or run apps individually:

```bash
# Web (http://localhost:5173)
pnpm --filter @reactify/web dev

# API (http://localhost:3001)
pnpm --filter @reactify/api dev
```

Copy environment examples before running the API:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

For real Anthropic design analysis, set these in `apps/api/.env`:

```bash
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=your-local-secret
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
AI_TIMEOUT_MS=60000
AI_MAX_TOKENS=8192
AI_TEMPERATURE=0.2
```

The API key is server-side only. Do not add `VITE_ANTHROPIC_API_KEY` or call Anthropic from the browser.
Tests use `AI_PROVIDER=mock` and do not require a real API key.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## API health check

```bash
curl http://localhost:3001/health
```

## Monorepo layout

- `apps/web` — React + Vite frontend
- `apps/api` — Fastify backend
- `packages/shared` — shared utilities and constants
- `packages/ui` — shared UI components
- `packages/generation-contracts` — Zod schemas and TypeScript contracts
- `packages/test-utils` — test helpers and fixtures
- `prisma/` — database schema (future tasks)
- `prompts/` — versioned AI prompt files
- `docs/` — project documentation
