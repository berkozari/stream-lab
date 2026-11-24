# STREAM-003.5 — Update Video Metadata API

## Endpoint

`PATCH /api/v1/videos/:videoId` requires an active **Bearer access JWT**. The owner identity is taken exclusively from `req.auth.userId`.

Use the existing `UpdateVideoRequestSchema` (`@streamlab/contracts`): `title`, `description`, `categoryIds`, `visibility`. A request must include at least one field. Unknown fields (`ownerId`, `status`, `publishedAt`, `deletedAt`, `processingVersion`, storage keys) are rejected with `422`.

```json
{
  "title": "Updated title",
  "description": null,
  "categoryIds": [],
  "visibility": "PRIVATE"
}
```

- `description: null` clears the description; omission leaves it unchanged.
- `categoryIds: []` clears associations; omission preserves them. Nonempty lists replace the category set atomically. Missing category IDs return `422 CATEGORY_NOT_FOUND` and roll back the entire update.
- `visibility: PRIVATE` is allowed for non-deleting owned videos. `PUBLIC` or `UNLISTED` is allowed **only when `status=READY` and `publishedAt` is already set**. Initially publishing a video remains a separate workflow; PATCH never sets `publishedAt` or `status`.
- Missing, someone else's, or soft-deleted videos return `404 VIDEO_NOT_FOUND` (no ownership information leak). `DELETING` videos return `409 VIDEO_DELETING`. Invalid exposure attempts return `409 VIDEO_NOT_PUBLISHABLE`.
- Even an ADMIN cannot edit someone else's video through this owner-specific route. Admin moderation is a separate future API.
- The shared `VideoResponseSchema` allowlists response fields; `deletedAt`, internal processing fields, and storage keys are excluded. Successful updates return `200`, and the response carries `Cache-Control: no-store`.
- No Prisma migration or new dependencies required. Existing publication/read rules from STREAM-003.4 remain unchanged.

## Tests

```bash
pnpm format
pnpm verify:video:update
pnpm test:video:update
pnpm check
```

For the real PostgreSQL smoke test, start infrastructure and `pnpm dev:api`, then run `pnpm smoke:video:update` in a second terminal. The smoke script creates isolated users/videos/categories and cleans up only its own records.

### Important follow-up

The future publication endpoint must enforce the READY/asset checks before setting `publishedAt`. Retain atomicity and conditional writes when video processing status changes concurrently.
