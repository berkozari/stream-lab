#!/usr/bin/env bash
# Read-only logical backup. Database credentials are never passed as CLI arguments.
set -Eeuo pipefail
umask 077
: "${DATABASE_URL:?Set DATABASE_URL from your secret manager}"
: "${BACKUP_DIR:?Set BACKUP_DIR to a secure, encrypted destination}"
command -v pg_dump >/dev/null || { echo '[STREAM-009.7] pg_dump required' >&2; exit 1; }
command -v pg_restore >/dev/null || { echo '[STREAM-009.7] pg_restore required' >&2; exit 1; }
command -v node >/dev/null || { echo '[STREAM-009.7] Node.js required' >&2; exit 1; }
mkdir -p -- "$BACKUP_DIR"
now=$(date -u +'%Y%m%dT%H%M%SZ')
out="$BACKUP_DIR/streamlab-${now}.dump"
if [[ -e "$out" ]]; then
  echo '[STREAM-009.7] Backup path already exists; refusing to overwrite' >&2
  exit 1
fi
tmp=$(mktemp "$BACKUP_DIR/.streamlab-backup-XXXXXXXX")
trap 'rm -f -- "$tmp"' EXIT
# libpq accepts connection URIs via PGDATABASE; no password in process arguments.
PGDATABASE="$DATABASE_URL" pg_dump --format=custom --no-owner --no-acl --file="$tmp"
pg_restore --list "$tmp" >/dev/null
mv -- "$tmp" "$out"
node --input-type=module - "$out" <<'NODE' >"${out}.sha256"
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
const file = process.argv[2];
const digest = createHash('sha256');
for await (const chunk of createReadStream(file)) digest.update(chunk);
process.stdout.write(`${digest.digest('hex')}  ${basename(file)}\n`);
NODE
echo '[STREAM-009.7] PASS: backup archive validated and checksummed'
echo "[STREAM-009.7] File: $out"
