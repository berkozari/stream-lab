#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  echo 'ERROR: Root .env missing' >&2
  exit 1
fi

# Same local-only shell-compatible .env convention as STREAM-001.4.
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a
: "${S3_UPLOAD_BUCKET:?Missing S3_UPLOAD_BUCKET}"
: "${S3_MEDIA_BUCKET:?Missing S3_MEDIA_BUCKET}"

# Never use a fixed object key: don't overwrite user videos or fixtures.
key="_streamlab_smoke/$(date +%s)-$$-${RANDOM}.txt"
uploaded_targets=""
cleanup() {
  while IFS= read -r target; do
    [[ -n "$target" ]] || continue
    docker compose exec -T storage mcli rm "streamlab-local/${target}" >/dev/null 2>&1 || true
  done <<< "$uploaded_targets"
}
trap cleanup EXIT

for bucket in "$S3_UPLOAD_BUCKET" "$S3_MEDIA_BUCKET"; do
  payload="streamlab smoke ${bucket} ${key}"
  # mcli alias is initialized by scripts/infra-up.sh (or scripts/init-storage.sh).
  printf '%s' "$payload" | docker compose exec -T storage mcli pipe "streamlab-local/${bucket}/${key}" >/dev/null
  uploaded_targets+="${bucket}/${key}"$'\n'
  result="$(docker compose exec -T storage mcli cat "streamlab-local/${bucket}/${key}")"
  if [[ "$result" != "$payload" ]]; then
    echo "FAIL: Storage content mismatch in ${bucket}" >&2
    exit 1
  fi
  echo "PASS: ${bucket}: private object write/read"

  # A browser must not be able to access a private storage object anonymously.
  # Only local S3-compatible endpoint is queried; no credentials are exposed.
  status="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${S3_PORT:-9000}/${bucket}/${key}")"
  if [[ "$status" != '401' && "$status" != '403' ]]; then
    echo "FAIL: Anonymous GET in ${bucket} returned HTTP ${status}; expected 401/403" >&2
    exit 1
  fi
  echo "PASS: ${bucket}: anonymous read rejected (HTTP ${status})"
done

# Confirm cleanup on the success path; EXIT trap still handles failures.
for bucket in "$S3_UPLOAD_BUCKET" "$S3_MEDIA_BUCKET"; do
  docker compose exec -T storage mcli rm "streamlab-local/${bucket}/${key}" >/dev/null
  if docker compose exec -T storage mcli stat "streamlab-local/${bucket}/${key}" >/dev/null 2>&1; then
    echo "FAIL: Temporary object was not removed from ${bucket}" >&2
    exit 1
  fi
done
trap - EXIT
echo 'PASS: S3 storage roundtrip; temporary objects removed.'
