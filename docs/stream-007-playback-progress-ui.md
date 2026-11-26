# STREAM-007.5 — Playback Progress & Watch History UI

## Scope

- Authenticated viewers: GET initial progress before mounting the HLS player; completed videos start from zero.
- Save progress approximately every 15 seconds of activity and on pause, seek, end, page visibility loss. Progress requests are serialized/coalesced to prevent stale overwrites.
- Player capability renewal already preserves the current position, quality and pause state; persisted resume is used only on the initial mount.
- `/continue-watching` and `/history`: authenticated, user-scoped, cursor-paginated lists; no new Prisma migration or library.
- Anonymous viewers still watch public/unlisted-ready videos without watch activity recording.

## Security & limitations

- Only current-user `/users/me` API endpoints. No user IDs in request body. Access tokens remain in memory through the existing axios interceptor.
- Individual progress writes can fail (e.g., token expired, network lost); playback remains available, the page displays a warning, and the next media event can retry.
- Browser tab/browser crash can prevent the final save request from completing. This is a best-effort system, not lossless event tracking.
- The existing backend enforces READY/visibility, normalizes duration and determines completion at 95% or when the player ends.
- No signed playback/storage URLs are saved or logged in progress requests.

## Manual browser checks

1. Sign in as video owner; play a READY video 20-30 seconds, pause; inspect PUT `/api/v1/users/me/watch-progress/:videoId` (200), no userId field in body.
2. Leave watch page, reopen; video should start near the saved position. Pause and seek should generate a PUT promptly.
3. Let video finish; history displays "Tamamlandı" and it disappears from Continue Watching.
4. `/history` and `/continue-watching` show the current viewer's activity only; "Daha fazla göster" uses cursor-based pagination.
5. Log out; progress routes are inaccessible, existing public playback still works, history links are hidden.
6. Use two accounts and verify their progress histories are isolated.
7. Recheck STREAM-006.6A token renewal and quality selection; neither should reset watch position or cause a request per media frame.
