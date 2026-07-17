#!/usr/bin/env bash
set -euo pipefail

mkdir -p backups
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="backups/vetkeep-local-${stamp}.sql"

supabase db dump --local --file "$file"
sha256sum "$file" > "${file}.sha256"
echo "Created $file"
