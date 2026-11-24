# STREAM-003.3 — Create Video API

## Scope

Implement `POST /api/v1/videos` using the existing `Video` and `VideoCategory` Prisma models and the `CreateVideoRequestSchema` from `@streamlab/contracts`. This creates **metadata only**; it does not upload a binary file, enqueue a worker job, or publish a video. No migration or dependency changes are required.

## Security and behavior

- Requires a signed access JWT and a non-revoked PostgreSQL session via the existing `requireAuth` middleware.
- Only `title`, `description` and `categoryIds` are accepted from the body. The shared strict Zod schema rejects `ownerId`, `status`, `visibility`, `processingVersion`, `deletedAt`, `publishedAt` and unknown fields with HTTP `422`.
- `ownerId` is taken from `req.auth.userId`. A freshly created video receives Prisma defaults `DRAFT`, `PRIVATE`, `processingVersion = 0`, and `publishedAt = null`.
- The repository validates that every referenced category exists and creates category join rows within the same Prisma transaction. If an ID is missing, the request returns `422 CATEGORY_NOT_FOUND` and no video row is committed.
- HTTP `201` uses the shared `VideoResponseSchema` to allowlist public metadata, excluding database-only fields and storage keys. Responses have `Cache-Control: no-store`.
- The authenticated creation API uses an explicit `Authorization: Bearer` header rather than cookie authentication. CSRF token is not required for this endpoint; cookie-based auth endpoints retain their CSRF protections.

## Example

```http
POST /api/v1/videos
Authorization: Bearer <ACCESS_JWT>
Content-Type: application/json

{"title":"My first video","description":null,"categoryIds":[]}
```

```json
{
  "success": true,
  "data": {
    "id": "<uuid>",
    "ownerId": "<uuid>",
    "title": "My first video",
    "description": null,
    "status": "DRAFT",
    "visibility": "PRIVATE",
    "durationSeconds": null,
    "publishedAt": null,
    "createdAt": "<ISO date>",
    "updatedAt": "<ISO date>"
  }
}
```

## Acceptance

```bash
pnpm format
pnpm verify:video:create
pnpm test:video:create
pnpm check
```

With PostgreSQL, Redis and a running API:

```bash
bash scripts/infra-up.sh
pnpm dev:api              # terminal 1
pnpm smoke:video:create   # terminal 2
```

Expected smoke result:

`PASS: JWT owner -> valid categories -> DRAFT/PRIVATE -> sanitized 201 -> PostgreSQL`

The smoke script creates isolated test records and deletes only those records after completion. `STREAM-003.4` will add video listing and detail endpoints; until then the GET endpoints remain planned in OpenAPI.
