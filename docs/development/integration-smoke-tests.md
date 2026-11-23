# STREAM-001.10 — Integration Smoke Tests

## Objective

Verify the STREAM-001 foundation as one system, without pretending that planned domain endpoints or real video transcoding are implemented.

The check deliberately keeps **fast tests** (run by `pnpm check`) separate from **integration smoke** (requires Docker and live processes). No new runtime dependencies are introduced.

## Prerequisites

From the repository root:

1. Ensure Node.js 24 and pnpm are installed.
2. Keep the root `.env` configured from STREAM-001.4. Docker Desktop must be running.
3. Run `bash scripts/infra-up.sh` to start infrastructure and ensure the private buckets and `mcli` alias exist.
4. Run `pnpm db:migrate:status` and `pnpm db:smoke` after migrating/seeding, if not done yet.
5. Run `pnpm dev` in **Terminal 1** (Web, API and Worker). Allow services to start; keep the terminal open.
6. In **Terminal 2**, run `pnpm smoke:integration`.

The smoke runner **does not** start or stop your dev processes and **never** clears Docker volumes or your database.

## Commands

```bash
# Offline tests / manifest validation (no running services required)
pnpm verify:integration
pnpm test:integration:smoke
pnpm check

# Requires running Docker + Web + API + Worker
pnpm smoke:integration
```

Optional URLs when local ports have been customized:

```bash
API_BASE_URL=http://127.0.0.1:4000 WEB_BASE_URL=http://127.0.0.1:5173 pnpm smoke:integration
```

If `WEB_BASE_URL` differs from your API `CORS_ORIGINS` configuration, update the latter so the CORS origin is explicitly allowed.

## What it checks

1. Existing Docker infrastructure smoke: PostgreSQL `SELECT 1`, Redis PING, storage health, private buckets, bucket CORS.
2. Prisma migration status reports no pending migrations.
3. Prisma query and seeded categories are available.
4. Private S3-compatible storage object write/read for each bucket, unauthenticated HTTP read denied, and cleanup of temporary test objects. This is **not** a browser presigned upload test.
5. Express liveness/readiness, correlation ID, allowed and denied CORS, 404 and invalid-JSON error responses.
6. Web SPA shell is returned for `/`, `/creator` and `/watch/example`, and Vite `/api` reverse proxy forwards health requests to Express. This proves HTTP routing, **not actual React rendering**.
7. BullMQ normal job and retry job complete through the existing API producer CLI and the live Worker.

## Manual browser acceptance

After the automated checks, use Chrome/Firefox DevTools to confirm:

- `/` renders the Home page and shows a successful API health indicator.
- `/creator` and `/watch/example` render their expected placeholder/layouts.
- A nonexistent Web path shows the React NotFoundPage.
- DevTools Console/Network shows no unexpected errors and the `/api/v1/health` request succeeds.
- At 375px and 768px widths there are no blocking layout issues.

Automated real-browser tests are scheduled for the later testing milestone.

## Failure diagnosis

- **Infrastructure smoke fails:** `docker compose ps`, `bash scripts/infra-up.sh`, then re-run.
- **Migration/seed fails:** inspect `pnpm db:migrate:status` and rerun the correct migration/seed commands. Do not reset persistent volumes.
- **Storage `mcli` alias missing:** run `bash scripts/init-storage.sh` and retry. The roundtrip test only creates its own unique temporary key.
- **API unavailable/503:** ensure `pnpm dev` is running, and PostgreSQL and Redis are healthy.
- **Web unavailable/proxy error:** ensure Vite is running and `apps/web/vite.config.ts` proxy points to the actual API port.
- **Queue job times out:** ensure the Worker is running (`pnpm dev:worker` if not using `pnpm dev`) and Redis is healthy.
- **Typecheck or format error:** run `pnpm format`, then `pnpm check`; review real error lines instead of changing strict compiler options.

## Out of scope

Actual authentication, video CRUD, direct-to-S3 upload signing, upload verification, FFmpeg transcoding, private HLS playback, production readiness and performance benchmarking are **not** tested or claimed in STREAM-001.
