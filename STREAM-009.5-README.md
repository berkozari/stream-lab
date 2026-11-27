# STREAM-009.5 — Logging, Metrics & Monitoring

Purpose: extend existing API/worker observability with consistent, server-issued correlation IDs, safe structured worker logs and low-cardinality BullMQ queue counters. No new database models, database migrations, metrics HTTP endpoint, or externally exposed dashboards.

## Install

From the `feature/stream-009-production-hardening` branch, ensure a clean or backed-up working tree. Extract the archive at the repository root. The package overlays **only files in the archive**; review `git diff --stat` before committing. It includes matching `package.json` and `pnpm-lock.yaml` changes to add the already-used `pino` dependency to the worker.

## Offline checks

```sh
node --test scripts/tests/verify-stream-009-5.test.mjs
node scripts/verify-stream-009-5.mjs
pnpm install --frozen-lockfile
pnpm --filter @streamlab/worker test:observability
pnpm --filter @streamlab/api test:observability
pnpm --filter @streamlab/worker test:lifecycle
pnpm --filter @streamlab/worker test:shutdown
pnpm --filter @streamlab/api test:foundation
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build
git diff --check
```

If formatting fails, run `pnpm exec prettier --write` **on the modified files only**, then repeat checks.

## Runtime check (non-production)

- Start development dependencies and a worker in staging or your local environment.
- Confirm the API response's `X-Request-Id` matches log `req.id` and `requestId` for the same request; supplied `X-Request-Id` must not replace the server-generated ID.
- Publish a test job and verify `job_completed` or `job_failed` events contain job ID/name **but not job payload**, signed URLs, credentials, or access tokens.
- Wait at least `WORKER_METRICS_INTERVAL_MS` (default: `60000`) and verify `queue_metrics` contains `waiting`, `active`, `delayed`, `failed` counts and `paused` boolean status.
- Deliberately interrupt staging Redis and verify `queue_metrics_error` is emitted without stopping processing due to telemetry failure; restore Redis and observe recovery.
- Confirm SIGTERM waits for active FFmpeg cleanup, cancels periodic polling, and terminates without hanging.

Queue metrics are **periodic log snapshots**, not Prometheus/OpenTelemetry instrumentation or a production alerting system. Delivery of logs to a monitoring backend, alert thresholds and dashboards remain deployment tasks.

See `docs/stream-009.5-logging-metrics-monitoring.md` for risks, runbook and acceptance criteria.
