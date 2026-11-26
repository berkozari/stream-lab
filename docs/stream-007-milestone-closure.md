# STREAM-007.8 — Final Regression & Milestone Closure

## Scope

This package **only adds** a final verification tool, a pure Git audit helper, its tests, and this document. It does not change production frontend/backend code, Prisma schema, dependencies, user data, or video storage.

STREAM-007 features delivered (per development and developer-run verification): public READY video discovery; title/description search; category catalog, creator category assignment, search/filter/pagination; authenticated Watch Progress, History and Continue Watching; resume and seek capture; initial publication of READY videos with explicit owner action.

## Final test commands

From the StreamLab repository root:

```bash
pnpm exec prettier --write \
  scripts/verify-stream-007-8.mjs \
  scripts/lib/stream-007-audit.mjs \
  scripts/tests/verify-stream-007-8.test.mjs \
  docs/stream-007-milestone-closure.md
node --test scripts/tests/verify-stream-007-8.test.mjs
node scripts/verify-stream-007-8.mjs --inspect-only
node scripts/verify-stream-007-8.mjs
```

The default command runs a Git status/safety audit, then five final gates:

1. Closure auditor tests.
2. The existing STREAM-007.6 12 offline gates (contracts, API HTTP, React tests, typecheck, ESLint, Prettier, web build).
3. STREAM-007.7 literal wildcard search and publication unit tests.
4. Video-update service/API regression.
5. Creator video UI regression.

Full 007.6 Playwright E2E (4 browser scenarios) was reported PASS before this package. The runner does **not** claim to rerun it by default. For a fresh full run against an already-running local environment, use `node scripts/verify-stream-007-8.mjs --e2e` with the same four E2E variables required by `scripts/run-stream-007-6.mjs --full`. **This alters test-account watch progress**; use dedicated test data. The runner rejects missing consent before other tests.

## Browser smoke acceptance

- Anonymous home list includes newly published `READY`/`PUBLIC` video with no search/category filter.
- `PRIVATE`, `UNLISTED`, deleted and non-READY videos are excluded from public discovery.
- Search for literal `%` and `_` does not return all video records; normal text search and filters work.
- Creator can publish an existing READY/private video; `publishedAt` is set on first publication, retained on subsequent edits; publishing before READY is blocked.
- History and Continue Watching require an authenticated session; User A cannot view User B progress.
- Seek sends PUT progress, re-opening the video resumes near the saved position, completed videos leave Continue Watching.
- STREAM-006 HLS playback, adaptive quality, token renewal and retry continue to work.

## Git security and release hygiene

`verify-stream-007-8.mjs` uses filename-only `git ls-files -z` to fail on committed/tracked `.env` files (except `.env.example`, `.env.sample`, `.env.template`), `test-results`, `playwright-report`, and `trace.zip`. It warns about tracked key/certificate files but does not open or print their contents. It checks staged and unstaged whitespace, logs current branch and the count of working-tree changes. It does **not** certify that credentials inside arbitrary source files are safe: inspect the staged diff before committing.

```bash
git status --short
git diff --stat
git diff --check
git diff --cached --stat
git diff --cached --check
git branch --show-current
```

Before making a PR: do not include local `.env`, credentials, signed S3 URLs, screenshots containing tokens, test-result traces, temporary ZIP installers, or backup files. Include the functional STREAM-007 source, tests and relevant docs. Confirm CI status and PR diff manually. Review database migration status; these STREAM-007 application changes should not require a new migration.

## Known boundaries / follow-ups

- Discovery `contains` query performance has not been benchmarked on production-scale data. Before indexes/FTS/pg_trgm, run `EXPLAIN (ANALYZE, BUFFERS)` on representative staging data and record actual latency.
- Client-side watch-progress request coalescing does not eliminate _cross-device_ out-of-order writes; revisit server-side versioning if observed.
- Mock-auth Express HTTP tests check handler-level scoping, not production JWT signature verification; keep auth regressions and real browser tests.
- Signed media URL expiry and token renewal remain STREAM-006 responsibility; the 007.8 script includes web playback regression through the 007.6 offline runner, not a new long-playback soak test.
- Do not claim milestone closed until final runner passes locally and the PR/merge is complete.

## Suggested merge workflow (after review)

```bash
git add <reviewed-STREAM-007-files>
git diff --cached --stat
git diff --cached --check
git commit -m "feat(discovery): complete search categories and watch history"
git push -u origin "$(git branch --show-current)"
```

Use your repository's PR process to merge the feature branch into `main` after CI approval. Confirm `main` has the merged commit before beginning STREAM-008.
