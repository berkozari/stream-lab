# STREAM-009.4 — Database, Redis & Analytics Lifecycle

## Decision and data contract

The playback ingestion pipeline stores one server-validated row per client-generated session ID. `viewerId` may identify an authenticated viewer. These **raw sessions** are retained for a default of **120 days since the last event**, with a minimum configurable retention of **60 days**. This is an engineering default, not a legal/privacy policy approval: verify actual legal requirements, user-facing notices, and deletion requests before production.

The dashboard's `7d` / `30d` views remain **rolling 7/30 × 24 hours** based on `startedAt`; 60-day minimum retention ensures purged sessions cannot fall inside these windows when `lastEventAt >= startedAt`. For `range=all`, `VideoAnalyticsArchive` preserves _qualified view counts_, _completed view counts_ and _qualified watched seconds_, **without viewer/session identifiers**. Unqualified rows are deleted without affecting reported metrics. `WatchProgress` is a separate user feature and is not deleted here.

Every maintenance invocation uses a fixed cutoff and bounded batches. Each batch is **one atomic SQL statement**: `SELECT ... FOR UPDATE SKIP LOCKED` locks candidates; `DELETE ... RETURNING` feeds aggregates; `INSERT ... ON CONFLICT DO UPDATE` adds them to the archive. PostgreSQL rolls back the DELETE if the archive operation fails. Re-running the command does not add deleted rows twice. A live playback heartbeat holds the session row lock and the purge skips locked rows; processing resumes on the next run. Deleted videos' archive records follow the video FK cascade (normal soft-deleted videos remain filtered from creator queries).

**Assumptions to validate:** playback capability expiry is far shorter than retention, server clocks are synchronized, `lastEventAt` is not older than `startedAt`, and creator analytics do not require anonymous session-level history after retention. The archival model intentionally does not support daily historical `all` charts (they currently return `daily: []`).

## Migration and rollout order

1. Take and verify a PostgreSQL backup/snapshot; confirm replica lag and available disk on staging, and schedule a deployment window. New archive rows are computed _only when the maintenance command runs_.
2. Run `pnpm --filter @streamlab/api db:migrate:status` and inspect `apps/api/prisma/migrations/20261127100000_analytics_retention_archive/migration.sql`.
3. Deploy migration using `pnpm --filter @streamlab/api db:migrate:deploy` in the approved environment, then run `pnpm db:generate`, build/redeploy API code that combines all-time aggregates. **Do not purge until every API replica runs the archive-aware code**; old API versions would display lower all-time totals.
4. Compare `7d`, `30d` and `all` creator totals before/after the migration (migration alone must not change them).
5. On staging, run dry-run: `pnpm --filter @streamlab/api analytics:retention` and review the estimated eligible count and cutoff.
6. **Only on an approved database**: `ANALYTICS_RETENTION_APPLY_ACK=archive-and-purge pnpm --filter @streamlab/api analytics:retention --apply --days 120 --batch-size 500 --max-batches 10`. This deletes at most 5,000 raw sessions per invocation; if more remain, re-run deliberately or schedule controlled batches after checking DB/replica health. Leave dry-run as the production default.
7. Recheck all-time counts and 7d/30d trends, backup/restore ability, PostgreSQL bloat/maintenance, and privacy data removal. Recording/monitoring retention successes and failures can be handled in STREAM-009.5.

**Rollback:** stop maintenance before reverting code. If old code is deployed after any purge, `all` aggregates will appear lower until code is restored. There is no safe automatic inverse for a purge: recovery requires a verified database backup. Never drop the archive table with active archived data. Migration itself does not delete existing rows.

## Testing

```bash
node --test scripts/tests/verify-stream-009-4.test.mjs
node scripts/verify-stream-009-4.mjs
pnpm --filter @streamlab/api test:analytics:retention
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

**Optional PostgreSQL integration smoke, on an isolated/disposable database only:**

```bash
ANALYTICS_INTEGRATION_ACK=disposable-database pnpm --filter @streamlab/api smoke:analytics:retention
```

The smoke creates synthetic records within a transaction, tests archival and idempotent second pass, then aborts the transaction intentionally. It still executes real SQL and acquires locks, so it is forbidden on production. The static/offline verifiers are not a substitute for PostgreSQL execution.

## Query performance / index evidence

This change adds only an index required for the oldest-first maintenance lookup: `PlaybackAnalyticsSession(lastEventAt, id)`. It does **not** preemptively add indexes for creator grouping or search; first collect plans on realistic staging data. With a dedicated test creator ID, measure each of the following against `7d`, `30d`, and `all` data distributions:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT s."videoId", COUNT(*) AS qualified_views,
       COALESCE(SUM(s."watchedSeconds"), 0) AS watched_seconds
FROM "PlaybackAnalyticsSession" AS s
JOIN "Video" AS v ON v."id" = s."videoId"
WHERE v."ownerId" = '<staging-creator-uuid>'::uuid
  AND v."deletedAt" IS NULL AND s."qualifiedAt" IS NOT NULL
  AND s."startedAt" >= NOW() - INTERVAL '30 days'
GROUP BY s."videoId";

EXPLAIN (ANALYZE, BUFFERS)
SELECT "id" FROM "PlaybackAnalyticsSession"
WHERE "lastEventAt" < NOW() - INTERVAL '120 days'
  AND "startedAt" < NOW() - INTERVAL '120 days'
ORDER BY "lastEventAt", "id" LIMIT 500;
```

These are **read-only SELECT** plans. Replace placeholder UUIDs on staging only; never include viewer IDs, bearer tokens, secrets or raw event bodies in shared output. Capture row counts, `shared hit/read`, execution time, temp I/O and plans before claiming an optimization. p50/p95 should be measured under representative concurrent load as part of STREAM-009.6. `EXPLAIN ANALYZE` runs the SELECT and can consume I/O.

## Redis scope

Shared Redis rate limits and BullMQ/outbox/recovery logic from 009.2–009.3 are preserved. The new aggregate uses PostgreSQL, _not_ an implicit Redis cache. Caching creator analytics now would require explicit tenant-scoped keys, TTL/invalidation on each session update, purge, video deletion and ownership change; adding such a cache without a latency baseline would risk stale or cross-tenant metrics. Review Redis connection saturation and request/queue latency in STREAM-009.5/009.6.

## Known limitations / approval checklist

- The configured **120 days** is a proposed default; legal/privacy approval and user-delete handling remain separate production-readiness tasks.
- Maintenance has no built-in scheduler; run it via an explicitly managed deployment job with bounded batches and alerts.
- Backups, PITR, autovacuum and restore drills remain infrastructure tasks; archive totals cannot reconstruct deleted session-level records.
- Postgres integration smoke, load measurements and migration deployment require the user's environment. Static PASS alone does not certify live DB integrity.
- Any negative effect on dashboard totals, locks, replica lag or latency means STOP maintenance and investigate before another batch.
