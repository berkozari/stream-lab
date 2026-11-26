# STREAM-007.4 — Watch Progress, History and Continue Watching API

Scope: **backend only**. No new Prisma migration or package dependency required. Frontend writes and pages are planned in STREAM-007.5.

## Routes

All require an **access JWT**, with authentication/session invalidation checks performed by the existing middleware. User identity comes exclusively from `req.auth`.

| Method | Route                                                    | Behavior                                                                  |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| `PUT`  | `/api/v1/users/me/watch-progress/:videoId`               | Save video position; body `{ "positionSeconds": 28, "completed": false }` |
| `GET`  | `/api/v1/users/me/watch-progress/:videoId`               | Current progress or `data: null` if not watched                           |
| `GET`  | `/api/v1/users/me/watch-history?limit=20&cursor=...`     | Last watched, latest first                                                |
| `GET`  | `/api/v1/users/me/continue-watching?limit=20&cursor=...` | Position > 0, not marked complete                                         |

Response shape: `{ "success": true, "data": ... }`, with `Cache-Control: private, no-store`.

## Access / privacy

- Only READY and non-deleted videos are eligible.
- A user may write progress for their own READY video, or a published PUBLIC/UNLISTED video. Admin retains the already-established privileged access rule.
- Private videos of other users, drafts, inaccessible and deleted videos return the same `404 VIDEO_NOT_FOUND` result.
- History/continue lists exclude videos that are **no longer accessible** to this viewer; no storage or playback URLs are returned.
- A cursor is bound to the authenticated viewer and list mode. It is pagination metadata, **not a security token**.
- Server caps playback position to the persisted video duration when known; completion is marked explicitly or after reaching 95% of duration. Rewatching from before 95% clears completion.
- Client should report progress about every 15 seconds (plus pause/seek/end), not each second; server always validates values.

## Limitations / follow-up

- The current upsert is last-write-wins; simultaneous devices can overwrite progress. Per-session monotonic versioning is future work if the product requires it.
- The API does not prove that a viewer truly watched each second; timestamps/position are user-reported convenience data.
- Full DB integration tests and frontend UX come next, after typecheck/lint and HTTP verification in the project's real workspace.
- For development, only use non-production users/test data; never print JWTs in logs.
