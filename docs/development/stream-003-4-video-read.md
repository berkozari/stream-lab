# STREAM-003.4 — Video Listing & Detail API

## Endpoints

- `GET /api/v1/videos?limit=20&cursor=&q=&category=` — anonymous public discovery, only `READY` + `PUBLIC` + published + non-deleted videos.
- `GET /api/v1/videos/mine?limit=20&cursor=&q=&category=` — active JWT required; owner sees their own non-deleted drafts/processing videos and public videos.
- `GET /api/v1/videos/{videoId}` — anonymous detail for `READY` + published `PUBLIC`/`UNLISTED`; owner/admin with active JWT can read unpublished/private video; deleted always 404.

## Visibility / security

- Unauthorized access to hidden videos returns 404, not data-bearing 403. All read responses use the shared `VideoResponseSchema` field allowlist; internal storage keys, `deletedAt` and `processingVersion` are excluded.
- If an Authorization header is sent on an optional-auth detail endpoint, it **must be valid**. Invalid tokens are rejected with 401 rather than silently downgraded to anonymous.
- A pagination cursor is a base64url-encoded structured position, not a secret or capability. It is scoped to public-vs-owner list and active search/category filters. The backend checks the query, ownership and publication predicates on every request regardless of cursor contents.
- `createdAt DESC, id DESC` keyset order handles same-timestamp videos deterministically. `limit + 1` detects further pages without an expensive COUNT query.
- `q` performs a case-insensitive title/description search; `category` filters the category's slug. Query validation reuses `VideoListQuerySchema` from `@streamlab/contracts`.

## Test commands

```bash
pnpm format
pnpm verify:video:read
pnpm test:video:read
pnpm check
```

For actual PostgreSQL and HTTP testing, run infrastructure and the API in one terminal, then:

```bash
pnpm smoke:video:read
```

The smoke test creates isolated sample users and videos, then cleans up only its own records.

No Prisma migration or new dependency required.
