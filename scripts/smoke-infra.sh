#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  echo 'ERROR: Root .env missing. Run: cp .env.example .env' >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
: "${POSTGRES_USER:?Missing POSTGRES_USER in .env}"
: "${POSTGRES_DB:?Missing POSTGRES_DB in .env}"
: "${S3_UPLOAD_BUCKET:?Missing S3_UPLOAD_BUCKET in .env}"
: "${S3_MEDIA_BUCKET:?Missing S3_MEDIA_BUCKET in .env}"

docker compose config --quiet

echo '[1/4] PostgreSQL SELECT 1'
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc 'SELECT 1' | grep -qx '1'

echo '[2/4] Redis PING'
docker compose exec -T redis redis-cli ping | tr -d '\r' | grep -qx 'PONG'

echo '[3/4] Storage health and private buckets'
docker compose exec -T storage silo healthcheck ready
docker compose exec -T storage mcli stat "streamlab-local/$S3_UPLOAD_BUCKET"
docker compose exec -T storage mcli stat "streamlab-local/$S3_MEDIA_BUCKET"

echo '[4/4] Per-bucket CORS'
docker compose exec -T storage mcli cors get "streamlab-local/$S3_UPLOAD_BUCKET" > /dev/null
docker compose exec -T storage mcli cors get "streamlab-local/$S3_MEDIA_BUCKET" > /dev/null

echo 'PASS: PostgreSQL, Redis, storage, private buckets, and CORS.'
