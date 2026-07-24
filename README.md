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

Copy environment examples before running the API in production-like mode:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

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
- `prompts/` — versioned AI prompt files (future tasks)
- `docs/` — project documentation
