# STREAM-007.1 Architecture Review & STREAM-007.2 Discovery Foundation

Source basis: `streamlab-STREAM-007.1-review.zip` uploaded 2026-11-26.

## Verified current state

- Database schema already defines `Category` (unique slug), `VideoCategory` (composite primary key) and `WatchProgress` (composite userId/videoId key, indexed by userId/lastWatchedAt). Migration is **not** required for this foundation.
- Public video endpoint: `GET /api/v1/videos`, `q`, `category`, `cursor`, `limit` (1–50, default 20). Read filter enforces `READY`, `PUBLIC`, non-null publishedAt and null deletedAt.
- `GET /api/v1/videos/mine` requires auth and is owner-scoped; `GET /api/v1/videos/:id` may return READY+published UNLISTED details but does not list them publicly.
- Keyset pagination sorts by `createdAt DESC, id DESC`. Cursor includes public/mine scope and optional search/category context, preventing accidental reuse across filters.
- Shared Zod video contracts, React Query infinite query and Axios client are already present. Creator metadata API already accepts category IDs (up to 10 unique) but creator form does not expose category controls.
- Seed contains five categories: education, technology, entertainment, documentary, gaming.
- Home page is still a frontend-foundation placeholder. There is no public category listing endpoint; watch progress has no read/write HTTP routes or player integration in the supplied source.

## 007.2 implementation

Adds only missing discovery foundation, without changing video list permissions or database schema:

1. `GET /api/v1/categories` returns `{success:true,data:{items:[{id,name,slug}]}}`. Does not expose counts or hidden video relationships.
2. A public discovery HomePage with search, category filter, cursor-driven Load More, empty/loading/error states and links to existing `/watch/:videoId`.
3. Shared contract validation for category responses and a React Query categories hook.
4. Unit tests covering category serialization and discovery query normalization.

No new packages or database migrations. Cards intentionally use a neutral icon instead of an image: the current public Video DTO has no thumbnail URL, and signing a secure thumbnail URL needs a separate design. Do not make the storage bucket public for thumbnails.

## Follow-on work

- **007.3–007.4:** Add category selector to creator edit/create form, expose current video category IDs for edit, preserve atomic category writes and fix stale category associations. Possibly improve search filters and rate/performance only after measuring.
- **007.5:** Discoverability UX and browse refinements: query URL history, search keyboard and accessibility, skeletons, image endpoint if secure. Paginated lists should not repeatedly refetch on render.
- **007.6:** Authenticated `GET/PATCH /api/v1/me/watch-progress` (endpoint naming to finalize) with strict ownership, READY/playable checks, bounded position, sensible completion threshold, out-of-order event handling, and rate limits. All userId values must come from auth, never body.
- **007.7:** Use play/pause/seek/visibility/unmount events with throttled saves (e.g. ~15–30 s, not per frame) and Continue Watching. Never log tokens/PII/progress details unnecessarily.
- **007.8–007.9:** Index/performance checks, privacy/visibility-change regression, E2E tests and closure.

## Source-specific considerations

- Existing index `@@index([status, visibility, deletedAt, publishedAt])` doesn't directly optimize the `createdAt DESC, id DESC` keyset order. Consider an index guided by EXPLAIN ANALYZE on representative data, not speculative migrations.
- Current search uses case-insensitive `contains` on title/description; for large data sets, evaluate full-text search or trigram indexes before introducing an external engine.
- Public discovery must never show PRIVATE, UNLISTED, draft, processing, failed or soft-deleted video metadata.
- Do not expose WatchProgress in public list/details, or any other user's history.
- In the current frontend, video creation always sets `categoryIds: []`; category filters may return empty results until categories are assigned through the metadata API or later creator controls.

## Local acceptance checklist

1. `GET /api/v1/categories`: 200 with exactly the seeded categories in the response (assuming seed has run).
2. `/`: public READY videos load anonymously; PRIVATE/UNLISTED/processing/deleted ones don't.
3. Query filters: search by title, category slug, combination; no-results and network-error UI.
4. Cursor: Load More doesn't repeat entries, changing q/category starts from page one, URL reload/back works.
5. `pnpm --filter @streamlab/api test:video:read`, `pnpm --filter @streamlab/web test:video:client`, `pnpm --filter @streamlab/contracts test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm --filter @streamlab/web build`.
