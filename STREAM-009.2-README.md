# STREAM-009.2 — Authentication & API Hardening

Patch for audit findings **009-F01** and **009-F02**. Adds production Redis-backed rate limiting, explicit trusted proxy allowlist, blank example secrets and an idempotent auth/playback secret generator. No new dependencies/migrations. F03 GitHub Actions remains scoped to STREAM-009.6.

## Apply

From the StreamLab repository root, on `feature/stream-009-production-hardening`:

```bash
unzip ~/Desktop/streamlab-STREAM-009.2-hardening.zip -d .
node --test scripts/tests/verify-stream-009-2.test.mjs
node scripts/verify-stream-009-2.mjs
pnpm --filter @streamlab/api test:hardening
pnpm --filter @streamlab/api test:security
pnpm --filter @streamlab/api test:register
pnpm --filter @streamlab/api test:login
pnpm --filter @streamlab/api test:refresh
pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
```

Run `pnpm exec prettier --write` on changed files if needed before `format:check`; do not blindly reformat the entire repository. Read [docs/stream-009.2-api-hardening.md](docs/stream-009.2-api-hardening.md) **before** configuring an existing `.env` or deploying. In particular, the secret generator never replaces populated keys, and production needs `REDIS_URL` / `RATE_LIMIT_STORE=redis`.

**Ready to merge only after developer-reported runtime tests, staging proxy+Redis verification, clean diff and CI/PR review.**
