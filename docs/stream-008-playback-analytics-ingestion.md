# STREAM-008.3 — Playback Analytics Ingestion (backend foundation)

## Scope and metric definitions

`WatchProgress` remains the viewer's latest resume position. It is **not** a view counter and is not used for analytics. `PlaybackAnalyticsSession` stores one bounded, idempotent playback session per client-generated UUID. **Qualified view** means at least 3 seconds of accepted player-reported active playback within one session, _not_ proof of a human viewer. Replays of the same video in a new session may count separately. Watch time is an estimate bounded by the server elapsed time, not an audit-grade measure.

This stage adds **only the server ingestion contract and persistence**. The React HLS player is not yet wired to this endpoint. Existing creator summary cards continue to show video inventory statistics, **not views/watch time**. STREAM-008.4 will implement player-side event reporting; metrics aggregation and charts follow that implementation and its E2E verification.

## Database migration (required)

Schema ownership: `apps/api/prisma/schema.prisma`; migration at `apps/api/prisma/migrations/20261126133000_playback_analytics_sessions`. The table stores video ID, nullable viewer ID, processing version, sequence, position, capped watch seconds and qualified/completed timestamps. It does **not** store IP addresses, auth credentials, signed tokens or unbounded per-heartbeat event rows. User deletion can null the viewer ID; hard-deleting a video cascades its analytics sessions. Production retention/roll-up job is **not included** and must be defined before sustained production traffic.

Recommended local sequence (use the correct development database, back up important data before migrating):

```bash
pnpm --filter @streamlab/api db:validate
pnpm --filter @streamlab/api db:migrate:status
pnpm --filter @streamlab/api db:migrate:deploy
pnpm db:generate
pnpm --filter @streamlab/contracts build
pnpm typecheck
```

Do **not** run migrations against a production database before reviewing the SQL and deployment backups. `migrate deploy` applies the provided migration; it does not create a new one.

## HTTP contract

`POST /api/v1/videos/:videoId/analytics/events` (JSON). Required fields:

- `sessionId`: random UUID created anew on a player playback session, retained across manifest-token renewal.
- `sequence`: increasing integer from `0`. Same or lower sequence numbers are idempotently ignored; session identity cannot be repurposed to another video, viewer or encoding generation.
- `kind`: `START | HEARTBEAT | PAUSE | SEEK | ENDED`.
- `positionSeconds`: integer, video playhead position (0..864000).
- `playedSeconds`: **active-playback** seconds since previous event, integer 0..30; `START` and `SEEK` count zero.
- `playbackToken`: signed capability derived from existing playback manifest URL, sent in the JSON body, **never a query string**.

Successful responses are `{success:true,data:{sessionId,acceptedSequence,watchedSeconds,qualifiedView,completed}}` with `Cache-Control: private, no-store`. The API validates the signed capability, checks video is playable and the processingVersion still matches, and imposes a basic per-IP limiter. The stored session is updated using a compare-and-swap on `lastSequence`, protecting against replays and concurrent requests. No token is saved to Prisma.

## Privacy / correctness limits

1. Access to the **bearer playback token** gives temporary ability to submit telemetry for the video. This is consistent with the existing HLS capability model but is **not** anti-fraud identification. Never log or persist the token (or raw request body).
2. Server time and 30-second per-event bounds limit inflated client deltas, but cannot prove actual human attention. A client can create multiple session IDs; the IP limiter is only a best-effort abuse guard and is **in-memory per API process**. Harden with centralized quotas and bot heuristics before public production deployment.
3. `ENDED` only denotes a player-reported end after a qualified session, not a server-verified completion rate. Do not show audited completion metrics without additional validation against video duration.
4. No automatic cleanup/retention enforcement yet. Define retention period, account deletion semantics, and aggregation before scale.
5. This release intentionally leaves the frontend unchanged: no analytics data is recorded from the live browser until STREAM-008.4.

## Verification

```bash
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/api exec node --experimental-strip-types --test tests/unit/playback-analytics-rules.test.ts
pnpm --filter @streamlab/api exec node --import tsx --test tests/unit/playback-analytics.service.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
git diff --check
```

For a manual HTTP probe after migration, use a freshly issued legitimate playback token and random session UUID. Submit START sequence 0, then HEARTBEAT sequence 1 after 5 seconds. A duplicate sequence 1 should return the same accumulated watch seconds, not increment again. Do not paste real signed tokens into logs, terminal history or conversations.
