# STREAM-009.6 — Security & Performance Testing

**Scope:** new GitHub Actions CI workflow, consolidated security/worker regression launcher, behavioral HTTP boundaries and safe local-only health sampler. No application runtime changes, dependency changes, or Prisma migrations.

## Install

Extract the package into StreamLab repository root; review `git diff`, then run:

```bash
node --test scripts/tests/verify-stream-009-6.test.mjs scripts/tests/stream-009-6-perf.test.mjs
node scripts/verify-stream-009-6.mjs
node scripts/run-stream-009-6.mjs --plan
node scripts/run-stream-009-6.mjs --offline
pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
```

Offline runner requires project dependencies and local nonproduction Prisma configuration. **Do not point tests at production**. Local API performance sampling is strictly optional and **never** runs automatically; see `docs/stream-009.6-security-performance-testing.md` for flags and safety constraints.

After pushing, verify all three CI jobs on the PR. PostgreSQL migration smoke runs in the CI service container only. Prior STREAM-009.4 live DB verification is not retroactively proven until that job passes.
