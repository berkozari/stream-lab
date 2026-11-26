# STREAM-008.4 — HLS playback analytics integration

## Data flow

`VideoDetailPage` receives a short-lived playback manifest URL from the existing playback query. The `usePlaybackAnalytics` hook extracts its signed capability **in memory** and sends validated events to `POST /api/v1/videos/:videoId/analytics/events`. The `HlsPlayer` listens to HTMLMediaElement events separately from WatchProgress. It reports `START`, `HEARTBEAT`, `PAUSE`, `SEEK`, and `ENDED`.

- A session UUID and increasing sequence survive manifest/token renewal while the same player is mounted. A new player visit starts a fresh session.
- Analytics works for anonymous playback when a valid capability exists. It does not use WatchProgress or require a user to sign in.
- The token is only in the existing signed manifest URL and the **POST body**. Never log it, persist it, or expose it in analytics URL query parameters.
- A `timeupdate` or a seek does not imply watch time. Forward media movement is bounded by elapsed wall time; buffering, pauses, and seeks are excluded. The backend also caps accepted seconds by its own elapsed clock.
- The first qualifying heartbeat can be sent after ~5 seconds. Subsequent heartbeats normally aggregate ~15 seconds. Completion is signaled by `ENDED`.
- A sequential, bounded queue preserves event order. Failed telemetry is best-effort and never prevents playback, retry, ABR or WatchProgress.

## Known limitations

The browser can terminate a tab before the last analytics POST completes. This package does not persist tokens/events or make guaranteed-delivery claims. Signed token expiration and network failures can lose analytics events, and playback can remain functional. BACKEND metrics reflect **qualified playback sessions**, not independently verified unique human viewers. Consent, retention, bot controls, cross-device duplication, and aggregation/dashboard reporting remain later tasks.

## Test

```bash
pnpm --filter @streamlab/contracts build
node --experimental-strip-types --test apps/web/tests/playback-analytics-tracker.test.ts apps/web/tests/playback-analytics-queue.test.ts
pnpm --filter @streamlab/web test:playback
pnpm --filter @streamlab/web test:watch-history
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @streamlab/web build
```

## Manual verification

In Chrome DevTools → Network filter `analytics/events` (do not export HAR with credentials). A public READY video produces START then a HEARTBEAT after real viewing; paused/seeked/ended generate their corresponding events. In the request payload `playedSeconds` is `0` for START/SEEK and remains bounded for other events. Check the server responses for monotonic `acceptedSequence`, `watchedSeconds` and `qualifiedView=true` after ≥3 seconds **accepted** watch time. With a 60-second playback capability, renewal should not change `sessionId`; `sequence` remains increasing. Background/offline scenarios may drop telemetry but must not stop playback. Do not paste the `playbackToken`, signed manifest URL, or raw request payload into chat or logs.
