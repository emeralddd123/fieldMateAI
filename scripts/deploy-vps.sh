#!/usr/bin/env bash
set -euo pipefail

project_dir=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$project_dir"

env_file=${FIELDMATE_ENV_FILE:-.env.production}
compose_file=compose.production.yml

if [ ! -f "$env_file" ]; then
  echo "Missing $env_file. Copy .env.production.example and populate it first." >&2
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" config --quiet
docker compose --env-file "$env_file" -f "$compose_file" build --pull
docker compose --env-file "$env_file" -f "$compose_file" up -d --remove-orphans
docker compose --env-file "$env_file" -f "$compose_file" exec -T web \
  wget -q --spider http://127.0.0.1/health
docker compose --env-file "$env_file" -f "$compose_file" ps
