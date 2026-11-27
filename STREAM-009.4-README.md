# STREAM-009.4 — Database, Redis & Analytics Lifecycle

This package preserves all-time creator aggregates while retaining raw playback sessions for a bounded period. No Redis caching or unrelated API changes. See `docs/stream-009.4-database-redis-analytics-lifecycle.md` for rollout, retention/privacy and rollback decisions.

## Install (on feature/stream-009-production-hardening)

Extract package into repo root. This overlays **only the files listed in the ZIP**. Inspect `git diff --stat` and the migration before running any DB command. Existing `.env` is untouched.

## Offline checks

```sh
node --test scripts/tests/verify-stream-009-4.test.mjs
node scripts/verify-stream-009-4.mjs
pnpm --filter @streamlab/api test:analytics:retention
pnpm db:validate
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

Run `pnpm exec prettier --write` **only on modified files** if format:check reports differences, then recheck diff. Do not run migrations on a production DB without a reviewed backup.

## Database checks (staging only)

```sh
pnpm --filter @streamlab/api db:migrate:status
pnpm --filter @streamlab/api db:migrate:deploy
ANALYTICS_INTEGRATION_ACK=disposable-database pnpm --filter @streamlab/api smoke:analytics:retention
pnpm --filter @streamlab/api analytics:retention
```

The synthetic integration test is **disposable database only**, even though it rolls back. The maintenance CLI is dry-run by default and any actual archival + deletion requires `--apply` _and_ `ANALYTICS_RETENTION_APPLY_ACK=archive-and-purge`. See full procedure in docs.

## Expected evidence

- Static verifier 8/8 PASS, library unit tests PASS, migration validated.
- Staging-only transaction smoke succeeds (with isolation acknowledgement).
- No data deletion from deploying migration or running dry-run.
- `all` dashboard aggregates remain consistent after controlled purge; `7d` and `30d` remain unchanged.
- Representative PostgreSQL query plans recorded or transparently marked as not measured.
