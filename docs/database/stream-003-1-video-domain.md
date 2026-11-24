# STREAM-003.1 — Video Domain Model & Database Design

## Decision

**Reuse the existing `Video` and associated media models from STREAM-001.5. No schema change or migration is necessary for this task.** STREAM-002 added authentication-related tables without changing the video ownership model. Prisma schema ownership remains in `apps/api/prisma`.

This milestone defines the persistence and authorization contract for the CRUD tasks that follow. Validation DTOs, routes and services belong to STREAM-003.2–003.6; uploads, processing and playback belong to subsequent milestones.

## Entity ownership and relationships

- `User (1) → (N) Video` through `Video.ownerId`; `onDelete: Restrict` prevents accidental deletion of a user with videos.
- `Video (1) → (N) VideoUpload`, `MediaAsset`, `VideoRendition`, and `WatchProgress`. These rows are metadata, not the media file bytes.
- `Video (N) ↔ (N) Category` through `VideoCategory`; join rows have a composite key.
- Never accept `ownerId` from a create/update payload. Resolve it from authenticated server-side identity.
- Scope creator update, delete and private reads by **both** `id` and `ownerId`, and by `deletedAt: null`. Unauthorized/missing objects should not disclose another user's private video metadata.

## Metadata contract

| Property                 | Storage            | Decision                                                      |
| ------------------------ | ------------------ | ------------------------------------------------------------- |
| `id`                     | UUID               | Stable opaque identifier                                      |
| `ownerId`                | UUID, required     | Authenticated user, immutable after creation                  |
| `title`                  | `VARCHAR(160)`     | Required; trim and validate in STREAM-003.2                   |
| `description`            | Nullable text      | Optional; validate maximum application length in STREAM-003.2 |
| `status`                 | `VideoStatus`      | Defaults to `DRAFT`; processing lifecycle state               |
| `visibility`             | `VideoVisibility`  | Defaults to `PRIVATE` independently of processing state       |
| `processingVersion`      | Integer            | Starts at 0; changes only through processing workflow         |
| `durationSeconds`        | Nullable integer   | Unknown until media metadata is extracted                     |
| `publishedAt`            | Nullable timestamp | Explicit publish state, never implied by `READY`              |
| `deletedAt`              | Nullable timestamp | Soft-deletion and default list/read exclusion                 |
| `createdAt`, `updatedAt` | Timestamps         | Database-managed creation/update timestamps                   |

### Processing status vocabulary

`DRAFT`, `UPLOADING`, `UPLOADED`, `QUEUED`, `PROCESSING`, `READY`, `FAILED`, `DELETING` already exist in the schema. **Do not replace them with a shorter enum**: upload and transcoding milestones rely on these states.

Typical forward path: `DRAFT → UPLOADING → UPLOADED → QUEUED → PROCESSING → READY`. Failures may transition to `FAILED`; controlled retries and deletion transitions must be handled by services/worker and will be specified with the corresponding workflow. **The database enum alone does not enforce a transition graph.**

### Visibility and publication

- `PRIVATE`: only owner and explicitly authorized server-side callers can access video metadata or playback.
- `UNLISTED`: excluded from discovery. A URL alone is not an access token; playback permissions must still be enforced by the playback layer.
- `PUBLIC`: eligible for discovery **only** with `status = READY`, `deletedAt IS NULL`, and `publishedAt IS NOT NULL`.
- A video becoming `READY` **does not automatically become public**.
- New videos always begin as `DRAFT` and `PRIVATE` with null publication date.

Example public-discovery filter for later repository code:

```ts
const where = {
  status: 'READY',
  visibility: 'PUBLIC',
  deletedAt: null,
  publishedAt: { not: null },
} as const;
```

## Deletion policy

CRUD deletion will **soft-delete** video metadata (`deletedAt = now`) and remove it from all normal owner/public queries. Optionally force `visibility = PRIVATE` in the same update. Physical deletion of dependent media objects must be coordinated in a later, idempotent cleanup workflow. Avoid hard-deleting rows inside the basic CRUD endpoint: relations use restrictive foreign keys and S3 object deletion is not transactional with PostgreSQL.

## Indexes and query planning

Existing indexes:

- `Video(ownerId, createdAt)` for a creator's videos.
- `Video(status, visibility, deletedAt, publishedAt)` for broad discovery filtering.

For stable pagination, order by `createdAt DESC, id DESC` and use a compound cursor strategy if needed. Do not add unmeasured indexes in this design-only task. Revisit index ordering, partial indexes and query plans when the listing endpoints are implemented in STREAM-003.4.

## Constraints and safety boundaries

- Enforce metadata validation in Zod contracts and services in STREAM-003.2/003.3. Prisma nullability and enum checks are **not** sufficient input validation.
- Ownership authorization must run in the API, never only in React.
- Never expose `storageKey`, upload credentials or signed object URLs as generic public metadata.
- For `UNLISTED` and `PRIVATE`, playback authorization is separate from list visibility.
- Preserve `onDelete: Restrict` and `processingVersion` for later upload/processing workflows.
- No new migration: existing database schema already represents this domain. Avoid `prisma migrate dev` without an actual schema change.

## STREAM-003.1 acceptance checks

1. `pnpm verify:video:model` confirms the existing schema contract.
2. `pnpm db:validate` and `pnpm db:migrate:status` succeed against the local development database.
3. `pnpm smoke:video:model` verifies ownership, safe defaults, discovery filtering and soft deletion inside one **rolled-back** PostgreSQL transaction.
4. `pnpm check` succeeds, and Git shows **no Prisma schema/migration changes** from this package.

Next: STREAM-003.2 — metadata Zod schemas and shared request/response contracts.
