# STREAM-008.5 — Creator Analytics Aggregation & Dashboard

## Purpose and scope

The new **GET `/api/v1/creator/analytics?range=7d|30d|all`** endpoint aggregates
persisted `PlaybackAnalyticsSession` records for the authenticated creator only.
It does not use `WatchProgress` as a view counter and does not expose raw viewer IDs.
The existing creator content summary is unchanged.

## Metric definitions

- **Qualified views:** count of persisted playback sessions where `qualifiedAt IS NOT NULL`.
  A qualified session is not a unique person or a bot-filtered human view.
- **Watch time:** sum of `watchedSeconds` **only for qualified sessions**. Unqualified
  sessions intentionally do not contribute to the displayed watch-time metric.
- **Completed views:** qualified sessions with `completedAt IS NOT NULL`.
- **Completion rate:** completed qualified sessions / qualified sessions, as a percentage.
  A client `ENDED` event is an indication, not cryptographic proof of full viewing.
- **Average watch time:** qualified session watch seconds / qualified sessions,
  rounded to the nearest whole second.
- **Top videos:** five owned, non-deleted videos with the most qualified views;
  ties broken by watch time and then ID.
- **Range:** rolling 7 or 30 _24-hour UTC_ windows from request time; `all` has no
  start time. Sessions belong to a period based on their `startedAt`, even when a
  later heartbeat or completion occurs outside that window.

The backend groups counts and sums in PostgreSQL and fetches titles only for up to
five videos. It checks video owner and `deletedAt IS NULL` in every data query.

## API and privacy

`GET /api/v1/creator/analytics?range=7d` is auth-gated, with `Cache-Control:
private, no-store`, and responds with the shared Zod creator analytics schema.
Bad ranges return 422. The owner is always derived from `req.auth.userId`, never
from user-provided query parameters. Empty data returns zero-valued KPIs.

No migration or new dependency is introduced in 008.5. The 008.3 analytics schema
migration and the 008.4 player event tracking must already be deployed.

## Local checks

```sh
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/api exec node --experimental-strip-types --test tests/unit/creator-analytics-metrics.test.ts
pnpm --filter @streamlab/api exec node --import tsx --test tests/unit/creator-analytics.service.test.ts
pnpm typecheck && pnpm lint && pnpm format:check
pnpm --filter @streamlab/web build
```

Open `/creator`, check periods and empty states, then watch a playable video for
at least 3 accepted seconds and verify that the qualified view counter rises
for its creator. Compare 7d/30d/all. Verify unauthorized requests fail and
analytics errors do not hide the inventory summary or video management UI.

## Known limitations / future phases

This is an MVP aggregated snapshot, not a fraud-resistant analytics platform.
Sessions can be created from signed playback capability; user uniqueness is not
asserted. Cross-device anomalies, retention/rollups, high-cardinality groupBy
queries, delayed events and verified completion need further production work.
Benchmark `EXPLAIN (ANALYZE, BUFFERS)` before introducing indexes or precomputed
rollups. Null viewer identifiers and soft-deleted video filtering are intentional.
