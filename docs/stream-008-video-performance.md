# STREAM-008.6 — Creator Video Performance & Analytics Filtering

## Scope

- New owner-only `GET /api/v1/creator/videos/:videoId/analytics?range=7d|30d|all` endpoint.
- Existing Creator Dashboard range control is reused; no extra filtering state or migration.
- Creator can select a video from **Videolarım** (including zero-view drafts) or from the Top Videos list.
- Details show qualified views, qualified watch time, average watch time, completion rate, and UTC daily trends for rolling 7/30-day ranges.
- All-time displays all-time totals **without** a misleading truncated trend chart.
- `404` for missing, deleted or foreign-owned videos; `401` unauthenticated; `422` invalid UUID/date range.

## Analytics semantics

Qualified views are sessions with `qualifiedAt IS NOT NULL`. Watch time and completions
are counted only from those sessions. The time window is applied to `startedAt`,
matching STREAM-008.5. The rolling 7/30-day window can touch 8/31 UTC calendar days;
the chart contains all touched days, including empty ones. If the end time is near the
start of a day, only events since the exact rolling-window cutoff are counted for that
first day. Tooltip labels use UTC dates.

The SQL trend groups by UTC date **inside PostgreSQL**, joins `Video` and filters by
`ownerId` and `deletedAt IS NULL`, and binds parameters via Prisma's tagged `$queryRaw`.
Only aggregate daily values leave the API; viewer IDs, IP addresses, signed URLs,
playback tokens and raw session records are never returned.

These figures represent qualified playback sessions, not unique people and not
fraud-filtered/verified human views. No new database index is added without measured
`EXPLAIN (ANALYZE, BUFFERS)` evidence.

## Acceptance checks

1. Run contracts build, new unit/client tests, global typecheck/lint/format/build.
2. Authenticate as the creator and open `/creator`; use **Videolarım → Analitik**.
3. Confirm an unplayed owned video returns all zero values without a chart error.
4. Generate a qualified session and confirm 7d, 30d, and all-time totals and UTC days.
5. Select a Top Videos detail; switch range without resetting selection.
6. Verify a foreign user's video returns 404 and anonymous requests return 401.
7. Verify existing playback, history, summary cards and video management still operate.

## Known limitation

All-time trend is intentionally omitted. Large-scale trends/rollups, custom date
ranges, retention policy and fraud signals are deferred until real data volumes
are measured.
