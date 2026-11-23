#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -f .env ]]; then
  echo 'ERROR: Root .env missing. Run: cp .env.example .env' >&2
  exit 1
fi

docker compose config --quiet
docker compose up -d --wait
bash scripts/init-storage.sh
docker compose ps
