# STREAM-008.7 — Security, Performance & Data Quality

## Scope and evidence

Audited the StreamLab source from STREAM-008.1 and the STREAM-008.2–008.6 implementation packages. This package **adds tests, a regression runner and review notes only**; it does not modify production code, database schema, or privacy behavior.

### Existing controls inspected

- `playback-analytics.service.ts` validates an HMAC-signed playback capability before creating/updating a session; binds the session ID to `videoId`, `viewerId`, and `processingVersion`.
- `playback-analytics.repository.ts` uses conditional `updateMany` on `lastSequence` for optimistic concurrency; equal or older sequence numbers do not count again.
- `playback-analytics-rules.ts` limits reported watch time to server elapsed seconds, a 30-second per-event cap, and a 24-hour per-session cap. START and SEEK do not add watch duration.
- The creator analytics API requires authentication and filters data by video owner, excluding soft-deleted videos. The single-video service refuses a foreign or missing video before reading aggregates.
- Daily analytics use parameterized `$queryRaw` with UTC buckets, and API responses contain aggregate metrics rather than raw viewer sessions.
- The API logs remove query strings from playback request paths; `playbackToken` is configured for redaction. Audit any _additional_ loggers/APM tools separately.

**Important:** These findings are source-level evidence, not proof of production security or protection against synthetic/bot traffic.

## Regression

From the repository root:

```sh
pnpm exec prettier --write \
  apps/api/tests/unit/stream-008-analytics-data-quality.test.ts \
  apps/api/tests/unit/stream-008-creator-metrics-quality.test.ts \
  scripts/verify-stream-008-7.mjs \
  docs/stream-008-security-data-quality.md

node scripts/verify-stream-008-7.mjs --check
node scripts/verify-stream-008-7.mjs
```

The runner has **nine gates**: contracts build, analytics ingestion tests, creator metrics/authorization tests, playback regression, Watch History regression, typecheck, ESLint, Prettier and frontend build. It does **not** claim a live PostgreSQL integration test or real-browser PASS.

## Database performance validation — read only

Run `EXPLAIN (ANALYZE, BUFFERS)` on a representative **test/staging database** after confirming the connection target. For example, inspect the following parameterized **shape** with a real creator ID, qualified-session filter, and time window:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT s."videoId", COUNT(*) AS qualified_views,
       COALESCE(SUM(s."watchedSeconds"), 0) AS watched_seconds
FROM "PlaybackAnalyticsSession" AS s
JOIN "Video" AS v ON v."id" = s."videoId"
WHERE v."ownerId" = '<creator-uuid>'::uuid
  AND v."deletedAt" IS NULL
  AND s."qualifiedAt" IS NOT NULL
  AND s."startedAt" >= NOW() - INTERVAL '30 days'
GROUP BY s."videoId";
```

The placeholder is **not executable as written**. Replace it only with a dedicated test account UUID. Keep execution plans free of real user identifiers before sharing. `EXPLAIN ANALYZE` executes the SELECT and may use I/O; avoid running it on production without approval.

Record query time, shared blocks hit/read, table row count, and the index/scan strategy for 7-day, 30-day and all-time windows. The existing indexes on `(videoId, qualifiedAt)` and `(videoId, startedAt)` are a starting point. Do not add indexes solely because the query contains a filter: use measured query plans and realistic data volume first.

## Explicit residual risks and decisions

1. **Client-side tracking blockers:** Some privacy extensions block analytics telemetry. Do not bypass a user's blocking preferences. Report metrics as measured/qualified sessions, never as guaranteed total human views.
2. **Bot/replay limits:** Session UUID, increasing sequence and wall-clock caps help, but a valid playback token can still be used to fabricate plausible events. The IP limiter is in-process, not a distributed abuse-control system.
3. **Window semantics:** `7d` / `30d` filters use the session's `startedAt`; sessions crossing the cutoff are not split proportionally. Daily charts bucket by UTC date. They can contain 8 or 31 calendar buckets because these are rolling periods.
4. **Retention/privacy:** The system stores viewer ID when authenticated and does not yet implement retention/purge/roll-up. Define a retention policy before production launch, especially if historical metrics must survive raw session deletion.
5. **Scale:** The creator-wide query groups data by video and ranks top videos in memory. Monitor CPU, memory and SQL latency before considering database-ranked top-N or pre-aggregated summaries.
6. **Freshness:** Creator aggregates may lag due to request timing, client-side blocking, polling cadence or read races. Confirm accepted event responses and use `range=all` during debugging.

## Completion criteria

- All nine offline regression gates PASS.
- Two-account check: creator A cannot read creator B's per-video analytics (404), with authorized account able to read its own.
- Browser check: PLAY -> HEARTBEAT -> PAUSE updates view and watch-time after dashboard refresh; failures must not interrupt playback.
- Database query plans are recorded on a sufficiently representative dataset, or a lack of representative data is clearly documented.
- No secrets, signed tokens or client raw event bodies are committed or included in logs/test artifacts.
