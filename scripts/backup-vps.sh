#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

env_file=${FIELDMATE_ENV_FILE:-.env.production}
compose_file=compose.production.yml
backup_dir=${FIELDMATE_BACKUP_DIR:-backups}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="$backup_dir/fieldmate-$timestamp.sql.gz"

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file." >&2
  exit 1
fi

mkdir -p "$backup_dir"
docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$backup_file"
chmod 600 "$backup_file"
echo "Created $backup_file"
