# STREAM-007.7 — Discovery and Watch History Security / Performance Review

Basis: user-provided `streamlab-STREAM-007.1-review.zip` and subsequently supplied STREAM-007.2–007.6 installers and code in this task. **This is a static audit, not a live database query-plan benchmark.** Browser E2E 4/4 and offline 12/12 were reported as passed by the developer before this package.

## Evidence-backed findings

| Area                       | Code evidence                                                                                                                                                                                                            | Assessment / action                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Public discovery isolation | `video-read.repository.ts` applies `deletedAt:null`, `status:READY`, `visibility:PUBLIC`, `publishedAt != null`                                                                                                          | Preserved. Public discovery cannot enumerate private, unlisted or incomplete records.                                  |
| Owner collection           | `VideoReadFilter.scope='mine'`, `ownerId:userId`, `video-read.service.ts` rejects missing viewer                                                                                                                         | Preserved. Existing HTTP regression tests cover this path.                                                             |
| Video list cursor          | `video-cursor.ts` binds cursor to scope, search and category; max length 512                                                                                                                                             | Preserved. Malformed / cross-filter cursor is rejected. Cursor is _not_ an authorization token.                        |
| Watch progress isolation   | `watch-progress.routes.ts` uses `requireAuth`; service uses `viewer.userId`, not a userId from body; repository reads via composite `userId_videoId`                                                                     | Preserved. JWT/session authentication happens outside isolated injected-auth HTTP tests.                               |
| Watch progress visibility  | Repository checks `READY`, not deleted, plus owner/admin or published non-private access                                                                                                                                 | Preserved. Unlisted is not listed publicly but remains accessible to a viewer with its direct link.                    |
| History cache privacy      | `Cache-Control: private, no-store` for watch-progress routes                                                                                                                                                             | Preserved.                                                                                                             |
| History cursor scope       | `watch-progress.service.ts` checks viewer ID and `history` vs `continue`, max length 512 enforced by query schema                                                                                                        | Preserved.                                                                                                             |
| Discovery search wildcard  | PostgreSQL Prisma `contains` treats `%` and `_` as pattern wildcards                                                                                                                                                     | **Fixed:** escapes `%`, `_`, and backslash before handing literal text to Prisma.                                      |
| Query efficiency           | Public discovery uses `contains` with leading wildcard and sorts by `createdAt DESC, id DESC`. `Video` index covers status/visibility/deleted/published but not full order. History uses a `userId,lastWatchedAt` index. | **Not yet benchmarked.** Do not introduce indexes or search infrastructure before seeing plans on representative data. |

## How to measure query performance without changing data

Use **a dedicated development/staging PostgreSQL instance with realistic sample data** and run `EXPLAIN (ANALYZE, BUFFERS)` on generated SQL for these three real application queries:

1. Public catalog: `READY + PUBLIC + publishedAt != NULL + deletedAt NULL`, ordered by `createdAt DESC, id DESC`, `LIMIT 21`.
2. Public search + category: same predicate with `ILIKE` on `title`/`description` and a `VideoCategory` join, `LIMIT 21`.
3. Viewer history: `userId` equality, visibility/READY/deleted video check, ordered by `lastWatchedAt DESC, videoId DESC`, `LIMIT 21`.

Record median and p95 timings, total rows scanned vs returned, sort operations, buffer reads/hits, and representative table row counts. If searches are slow at scale, evaluate PostgreSQL `pg_trgm` indexes or FTS; if pagination sorts are costly, evaluate compound/partial indexes matching actual predicates and order. Prefer an explicit Prisma migration after test evidence—not speculative DDL in this audit package.

## Risk boundaries

- Escaping wildcard characters is **search correctness hardening**, not a claim that Prisma had SQL injection. Prisma continues to parameterize inputs.
- Client-side coalescing avoids common overlapping writes in a single tab, but cross-device or stale in-flight writes can still arrive out of order. If observed, design server-side version/sequence or timestamp conflict resolution with tests before making schema changes.
- History HTTP tests inject identities to exercise handler boundaries; they do not independently prove real JWT cryptography or database row isolation. Keep the existing auth and browser suites as regression gates.
- This package does not rewrite authorization, modify schema, or touch the HLS player. Re-run 007.6 offline and full browser suites after applying it.

## Acceptance

```sh
pnpm --filter @streamlab/contracts build
pnpm --filter @streamlab/api exec node --import tsx --test tests/unit/discovery-search-pattern.test.ts
node scripts/verify-stream-007-6.mjs
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @streamlab/web build
git diff --check
```

Optionally re-run `node scripts/run-stream-007-6.mjs --public` and, with explicit test-account/write consent, `--full`. Search in the browser for literal `%` and `_`: those must no longer match unrelated titles through SQL wildcard expansion.

References: [Prisma docs: filtering and sorting](https://www.prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting); [PostgreSQL LIKE pattern matching](https://www.postgresql.org/docs/current/functions-matching.html).
