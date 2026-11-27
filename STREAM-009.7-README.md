# STREAM-009.7 — Production Readiness & Configuration

**Purpose:** optional production deployment/reference hardening with no automatic migration or destructive action.

## Files

- `.dockerignore` — prevents env/credentials and host build outputs from entering Docker contexts.
- `deploy/Dockerfile` — build targets: `api`, `worker`, `migrate`, `web`.
- `deploy/compose.production.yml` — localhost-bound API/web and private worker; only external DB/Redis/S3.
- `deploy/nginx-web.conf` — static SPA serving; TLS and `/api` proxy must be supplied externally.
- `deploy/production.env.example` — blank secret fields; copy to root `.env.production` locally (gitignored).
- `scripts/production/preflight.mjs` — validates required production config without exposing values.
- `scripts/production/healthcheck.mjs` — readiness checks PostgreSQL and Redis through the API.
- `scripts/production/postgres-backup.sh` — read-only logical backup with restricted file permissions.
- `scripts/tests/production-preflight.test.mjs` — production config unit/CLI regression.
- `scripts/tests/verify-stream-009-7.test.mjs`, `scripts/verify-stream-009-7.mjs` — source-evidence gates.
- `docs/stream-009.7-production-readiness.md` — deployment, migration, backup, restore rehearsal, rollback and acceptance guide.
- `.github/workflows/streamlab-ci.yml` — adds 009.7 offline validations to existing quality job.

## Apply

From the repo root after checking for uncommitted files:

```bash
git status --short
unzip -o ~/Desktop/streamlab-STREAM-009.7-production-readiness.zip -d .
node --test scripts/tests/production-preflight.test.mjs scripts/tests/verify-stream-009-7.test.mjs
node scripts/verify-stream-009-7.mjs
bash -n scripts/production/postgres-backup.sh
pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
git diff --check
```

Use `pnpm exec prettier --write STREAM-009.7-README.md docs/stream-009.7-production-readiness.md scripts/production/preflight.mjs scripts/production/healthcheck.mjs scripts/verify-stream-009-7.mjs scripts/tests/production-preflight.test.mjs scripts/tests/verify-stream-009-7.test.mjs .github/workflows/streamlab-ci.yml deploy/compose.production.yml` to resolve any formatting warnings. Do **not** run Prettier on real `.env.production` secrets.

On an isolated staging host with Docker and approved credentials, follow `docs/stream-009.7-production-readiness.md` for `docker compose build`, `config --quiet`, migration and actual app/worker/browser checks. **Do not** run the migration, backup or `up` commands against production until your operational checklist and credentials are explicitly approved.

**Not verified here:** Docker image builds, live Redis/PostgreSQL/S3, GitHub CI, TLS ingress, FFmpeg throughput, full restore rehearsal, monitoring delivery or production deployment. No real secret included; migration/schema/dependencies/application business logic are unchanged by this task.
