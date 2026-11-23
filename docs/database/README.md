# STREAM-001.5 — Database Schema & Migrations

## Architectural boundaries

- PostgreSQL 17 from STREAM-001.4, with tables and relationships owned by `apps/api/prisma`.
- **Prisma 7.10.1**, intentionally pinned to a stable version. Prisma 8 is a release candidate at the time of this milestone; do not use `prisma@latest` without an explicit upgrade decision.
- API runtime Prisma Client lives under `apps/api/src/config/database.ts` (generated client is under `apps/api/src/generated/prisma`).
- Do not duplicate Prisma schemas or run migrations in `apps/worker`. A controlled shared database dependency is a later milestone.
- Application data, signed access secrets and raw video bytes do not belong in database migrations or seed files.

## Domain models (9)

1. `User` — account, ownership, role (USER/ADMIN).
2. `AuthSession` — hashed refresh tokens; revocation/expiration fields.
3. `Video` — metadata, processing state, visibility, soft-deletion marker, processing version.
4. `VideoUpload` — one upload attempt, unique storage key, expected bytes, optional multipart upload ID.
5. `MediaAsset` — original / thumbnail / HLS master object metadata, versioned for outputs.
6. `VideoRendition` — rendition playlists (360p / 720p / 1080p) and processing version.
7. `Category` — reusable video category metadata; unique slug.
8. `VideoCategory` — explicit m:n relation with composite primary key.
9. `WatchProgress` — per-user resume position with composite primary key.

The streaming storage itself is managed through the S3-compatible backend. Segments are not stored as database rows.

## Key decisions

- UUID primary keys, `@db.Timestamptz(3)` times, `BigInt` for storage byte counts.
- For public discovery, query `status=READY`, `visibility=PUBLIC`, `deletedAt=null`, and `publishedAt IS NOT NULL`. A record reaching READY **does not** publish it automatically.
- `UNLISTED` is discoverability control, not authentication. `PRIVATE` requires end-to-end playback authorization.
- Email normalization, password hashing, token rotation, processing state transitions and input validation are **service responsibilities** planned for later milestones. A DB unique email field by itself does not make emails case-insensitive.
- Video owner/metadata relations use `onDelete: Restrict`; video cleanup must coordinate deletion of dependent metadata and S3 objects. `VideoCategory` uses `onDelete: Cascade` only for harmless join-row cleanup when deleting video.
- `Video.processingVersion` and `VideoRendition.processingVersion` allow versioned output and deterministic processing retries. The active upload selection, commit of output version and publishing transaction will be designed in STREAM-004/005.
- `WatchProgress` is state, not an analytics event. View analytics is outside the MVP schema.
- One unique `storageKey` per upload attempt or media asset protects against accidental duplication; storage policy still needs to enforce object authorization.
- No automatic DB `CHECK` constraints in this initial Prisma-only schema; validate nonnegative positions/sizes and valid rendition dimensions in the service. Add database checks through reviewed SQL migrations if needed later.

## Migration workflow

From repository root (the root `.env` contains `POSTGRES_*` from STREAM-001.4):

```sh
unzip -n "$HOME/Downloads/StreamLab_STREAM-001.5_Database_Patch.zip" -d .
node scripts/apply-stream-001-5.mjs
pnpm install
pnpm db:validate
pnpm db:migrate:dev --name init_streamlab
pnpm db:generate
pnpm db:seed
pnpm db:smoke
pnpm typecheck
pnpm build
pnpm check
```

`migrate dev` creates a **real Prisma-generated** SQL migration under `apps/api/prisma/migrations/` and applies it to local PostgreSQL. **Commit that generated SQL migration** with your schema. This patch intentionally does not ship hand-written or unverified migration SQL. In Prisma 7, run `prisma generate` and `prisma db seed` explicitly after migrations.

The patch reads **root** `.env` rather than creating a second credentials file. It derives a local `DATABASE_URL` from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`. An explicit `DATABASE_URL` environment variable overrides this for CI and deployment. `POSTGRES_PORT` must match the Docker host port.

Never run `prisma migrate dev` in production; apply checked-in migrations with `pnpm db:migrate:deploy` as part of an approved deployment step.

## Troubleshooting

- `P1001` / connection refused: `docker compose ps` and `bash scripts/smoke-infra.sh` first; verify `POSTGRES_PORT`.
- Authentication failed: compare root `.env` credentials to the existing Docker volume's initialized credentials. **Do not** blindly delete volumes.
- `Prisma Client` module missing: `pnpm db:generate`.
- `relation ... does not exist`: run `pnpm db:migrate:status`, then `pnpm db:migrate:dev` in local development.
- Seed missing: `pnpm db:seed`. Re-running seed is safe (upsert keyed by category slug).
- Schema drift: investigate migration changes before accepting any reset prompt.
- `pnpm format:check` failure: run `pnpm format` once, inspect diffs, rerun `pnpm check`.

## Review before closing this milestone

1. Run `pnpm db:migrate:status` to ensure migration state is clean.
2. Run `pnpm db:smoke` after the idempotent seed, twice if desired.
3. Confirm no `.env` or generated Prisma Client files were staged.
4. Check in `apps/api/prisma/migrations/*/migration.sql` and `migration_lock.toml`.
5. Verify local `lint`, `typecheck`, and `build` are still successful.
