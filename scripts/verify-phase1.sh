#!/usr/bin/env bash
set -euo pipefail

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-fixture-fixture-fixture}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
export EXPO_PUBLIC_SUPABASE_URL="${EXPO_PUBLIC_SUPABASE_URL:-http://127.0.0.1:54321}"
export EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-fixture-fixture-fixture}"
export CI=1
export EXPO_NO_TELEMETRY=1

npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:audit

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  npm run db:start
  npm run db:reset
  npm run db:test
else
  echo "WARNING: Docker is unavailable; Supabase migration and pgTAP tests were not executed." >&2
  exit 3
fi
