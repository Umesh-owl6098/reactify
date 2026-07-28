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
  OPENAI_DESIGN_ANALYSIS_MODEL=gpt-4.1-mini-2025-04-14
  OPENAI_PLAN_MODEL=gpt-4.1-mini-2025-04-14
  OPENAI_CODE_GENERATION_MODEL=gpt-4.1-2025-04-14
  OPENAI_EDIT_MODEL=gpt-4.1-2025-04-14
  OPENAI_DESIGN_ANALYSIS_MAX_OUTPUT_TOKENS=8192
  OPENAI_PLAN_MAX_OUTPUT_TOKENS=8192
  OPENAI_CODE_GENERATION_MAX_OUTPUT_TOKENS=32768
  OPENAI_EDIT_MAX_OUTPUT_TOKENS=16384
  OPENAI_MAX_RETRIES=0
  AI_TIMEOUT_MS=180000
  JOB_INLINE_EXECUTION=false
  AI_PRICING_0_PROVIDER=openai
  AI_PRICING_0_MODEL=gpt-4.1-mini-2025-04-14
  AI_PRICING_0_INPUT_PER_MILLION_USD=0.4
  AI_PRICING_0_OUTPUT_PER_MILLION_USD=1.6
  AI_PRICING_1_PROVIDER=openai
  AI_PRICING_1_MODEL=gpt-4.1-2025-04-14
  AI_PRICING_1_INPUT_PER_MILLION_USD=2
  AI_PRICING_1_OUTPUT_PER_MILLION_USD=8
  AI_PRICING_ALLOW_FALLBACK=false
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
  JOB_INLINE_EXECUTION=true   # required when reactify-api runs without a separate worker service

Single-service API (no reactify-worker):
  Set JOB_INLINE_EXECUTION=true on reactify-api so export_preparation runs in the API process.
  Start command: corepack pnpm start:api (railway.api.toml)
  Do not deploy reactify-worker.

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
