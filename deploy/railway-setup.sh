#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v railway >/dev/null 2>&1; then
  echo "Install Railway CLI first: brew install railway"
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Run 'railway login' before deploying."
  exit 1
fi

PROJECT_NAME="${RAILWAY_PROJECT_NAME:-reactify}"
echo "Using Railway project: $PROJECT_NAME"

if ! railway status >/dev/null 2>&1; then
  railway init --name "$PROJECT_NAME"
fi

echo "Link GitHub repo Umesh-owl6098/reactify in the Railway dashboard if not already connected."
echo "Provision PostgreSQL and a Storage Bucket in the dashboard, then set shared variables on API and worker."

cat <<'EOF'

Required shared API/worker variables (names only):
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  AI_PROVIDER=openai
  OPENAI_API_KEY
  STORAGE_DRIVER=s3
  S3_ENDPOINT
  S3_REGION
  S3_BUCKET
  S3_ACCESS_KEY_ID
  S3_SECRET_ACCESS_KEY
  SESSION_COOKIE_SAME_SITE=none
  ALLOWED_ORIGINS=https://<web-domain>
  AUTH_ALLOWED_ORIGINS=https://<web-domain>

API-only:
  PORT (Railway injects)
  TRUST_PROXY=true

Web build variable:
  VITE_API_URL=https://<api-domain>

Deploy order:
  1. Postgres + bucket + shared vars on reactify-api and reactify-worker
  2. reactify-api (pre-deploy: corepack pnpm db:deploy, healthcheck: /ready)
  3. reactify-worker
  4. reactify-web after API URL is known (rebuild with VITE_API_URL)

Reference configs:
  railway.api.toml
  railway.worker.toml
  railway.web.toml
EOF
