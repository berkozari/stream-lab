# STREAM-008.2 — Creator video summary

`GET /api/v1/creator/summary` requires an active access JWT and returns `{ success: true, data: {...} }` with `Cache-Control: private, no-store`.

The endpoint only uses records with `Video.ownerId` equal to the authenticated user ID and `Video.deletedAt IS NULL`. `totalVideos` includes all non-deleted video statuses. `draftVideos` counts `DRAFT`; `processingVideos` counts `UPLOADING`, `UPLOADED`, `QUEUED`, and `PROCESSING`; `readyVideos` counts all `READY` (including private videos); `failedVideos` counts `FAILED`. `publishedVideos` is the **subset** of `READY` videos where `publishedAt` is set and `visibility` is `PUBLIC` or `UNLISTED` (so published and ready overlap; do not sum these cards).

**These are inventory metrics, not viewing analytics.** `WatchProgress` is per (viewer, video), stores latest state, and cannot establish view count, replay count, anonymous views, watch duration, or completion rates. Future STREAM-008 tasks will design dedicated watch-session / event ingestion before advertising those numbers.

Implementation keeps controller/service/repository and uses two aggregate SQL operations (Prisma `groupBy(status)` and `count` for published). There is no schema change, migration, new dependency, or change to viewer permissions. The frontend is scoped to the authenticated user, refreshes every 30 seconds to reflect transcoding changes, and invalidates cached summary after creator video mutations. No tokens or user IDs are logged.

## Local verification

```bash
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/api exec node --experimental-strip-types --test tests/unit/creator-summary-metrics.test.mjs
pnpm --filter @streamlab/api exec node --import tsx --test tests/unit/creator-summary.service.test.ts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @streamlab/web build
```

Browser: login, visit `/creator`, confirm six non-negative counts; create a draft and observe total/draft counters change; publish a READY video and observe published count; sign out and confirm that the endpoint rejects unauthenticated requests. Run more involved multi-user HTTP and E2E tests before milestone closure.
