# STREAM-006.6A — Signed Playback Renewal

## Purpose

The playback API issues a short-lived `manifestUrl` and an ISO `expiresAt`. The HLS variant playlists contain **direct, short-lived, signed storage URLs** for segments. A video longer than the token lifetime cannot rely on the original playlist forever.

## Design

- `usePlayback` refreshes the playback response before `expiresAt`, and when the browser regains focus/network access close to expiry.
- Existing Axios authentication/refresh behavior is reused; **no signed URLs or tokens are written to localStorage, sessionStorage, cookies, or logs** by this feature.
- `VideoDetailPage` keeps the **same** `<HlsPlayer>` instance (remove the key based on the token-bearing URL).
- When `manifestUrl` changes, `HlsPlayer` snapshots the playhead, paused/playing state, volume, mute, playback speed and manual quality label; then it reloads the new HLS source and restores those values on metadata availability.
- A brief rebuffering interruption is possible during renewal: this is not seamless media-source hot swapping.
- The Retry button requests a _fresh playback capability_ before reinitializing the video source. An authorization failure stays an authorization failure; it is not bypassed by retry.

## Validation

1. Standard and 4-rendition HLS recordings play; 360p/720p manual choice and Auto mode remain functional.
2. In DevTools Network, filter by `playback`; with `PLAYBACK_TOKEN_TTL_SECONDS=60` (dev only), the GET request is repeated before the 60-second token expires. Do not paste full signed URLs into issue tickets.
3. Play a video, seek to a nonzero timestamp, select 480p, pause/resume, and confirm a token renewal restores the playhead and quality choice when the profile still exists.
4. Pause a video and renew; it must remain paused. Open a second tab/private browsing window to check no cross-user query cache leaks.
5. Disable network, let the token expire, return to the tab, reconnect, then use retry; it must obtain a new capability rather than replaying the expired URL.
6. Verify unauthorized/private video responses remain denied. Confirm there are no token-bearing console log lines.
7. Run `pnpm --filter @streamlab/web test:playback`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and browser playback checks.

## Out of scope / follow-up

- True zero-interruption HLS source hot replacement is not included. There may be a brief buffering transition.
- Production deployment still requires strict frontend-origin allowlists and a browser-reachable private S3-compatible endpoint with CORS for signed segment GETs.
- Token/signature revocation is bounded by existing lifetimes; already-issued presigned objects cannot be retroactively invalidated without additional infrastructure.
- Dedicated Playwright E2E and bundle profiling belong to STREAM-006.7 and the remainder of STREAM-006.6.
