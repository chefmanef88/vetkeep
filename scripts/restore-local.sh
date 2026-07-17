#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <backup.sql>" >&2
  exit 2
fi

file="$1"
[[ -f "$file" ]] || { echo "Backup not found: $file" >&2; exit 2; }
[[ -f "${file}.sha256" ]] && sha256sum -c "${file}.sha256"

# Local Supabase database port from supabase/config.toml.
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "$file"
echo "Restored $file into the local disposable database"
