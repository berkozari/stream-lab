#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo 'ERROR: Root .env missing. Run: cp .env.example .env' >&2
  exit 1
fi

# The root .env is a developer-owned, shell-compatible local configuration.
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

: "${S3_UPLOAD_BUCKET:?Missing S3_UPLOAD_BUCKET in .env}"
: "${S3_MEDIA_BUCKET:?Missing S3_MEDIA_BUCKET in .env}"
: "${S3_ROOT_USER:?Missing S3_ROOT_USER in .env}"
: "${S3_ROOT_PASSWORD:?Missing S3_ROOT_PASSWORD in .env}"

# Run CLI inside the storage container. Its address is the internal container port
# (9000), regardless of the host-mapped S3_PORT value.
ALIAS='streamlab-local'
docker compose exec -T storage mcli alias set "$ALIAS" http://127.0.0.1:9000 "$S3_ROOT_USER" "$S3_ROOT_PASSWORD"

docker compose exec -T storage mcli mb --ignore-existing "$ALIAS/$S3_UPLOAD_BUCKET"
docker compose exec -T storage mcli mb --ignore-existing "$ALIAS/$S3_MEDIA_BUCKET"

# Explicitly disallow anonymous reads/writes; CORS is not authorization.
docker compose exec -T storage mcli anonymous set none "$ALIAS/$S3_UPLOAD_BUCKET"
docker compose exec -T storage mcli anonymous set none "$ALIAS/$S3_MEDIA_BUCKET"

# These paths are bind-mounted read-only at /config/cors inside the container.
docker compose exec -T storage mcli cors set "$ALIAS/$S3_UPLOAD_BUCKET" /config/cors/uploads.xml
docker compose exec -T storage mcli cors set "$ALIAS/$S3_MEDIA_BUCKET" /config/cors/media.xml

docker compose exec -T storage mcli ls "$ALIAS"
echo 'PASS: private storage buckets and per-bucket CORS configured.'
