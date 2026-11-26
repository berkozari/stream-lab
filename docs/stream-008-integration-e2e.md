# STREAM-008.8 — Creator Analytics integration and Playwright E2E

## Scope

Test-only addition: one Express HTTP integration test, one Playwright spec, two runners and this plan. No production code, database schema, Prisma migration or dependencies are modified.

### HTTP boundary (isolated)

`apps/api/tests/integration/creator-analytics.http.test.mjs` mounts real Express routes and controllers. Injected auth, in-memory playback-session persistence, fake clock and fake creator-reader fixtures make tests deterministic. It verifies:

- anonymous creator analytics access is rejected;
- owner-specific aggregate metrics and the `private, no-store` policy;
- invalid video IDs and date-range validation;
- a creator cannot read another creator's video analytics (404);
- playback session start, qualified heartbeat and duplicate idempotency;
- malformed event body, invalid capability and cross-viewer session reuse.

**Limitations:** These HTTP fixture tests do not validate the production JWT implementation, PostgreSQL aggregation SQL or cloud HLS connectivity. The per-video controller is deliberately mounted with an injectable reader for isolation. Run live E2E tests and inspect real database/query plans separately.

### Offline regression

From the repository root:

```sh
pnpm exec prettier --write \
  apps/api/tests/integration/creator-analytics.http.test.mjs \
  apps/web/tests/e2e/creator-analytics.spec.ts \
  scripts/verify-stream-008-8.mjs \
  scripts/run-stream-008-8.mjs \
  docs/stream-008-integration-e2e.md

node scripts/verify-stream-008-8.mjs --check
node scripts/verify-stream-008-8.mjs
```

The runner reuses STREAM-008.7's nine offline gates and adds HTTP integration, frontend analytics contract tests, playback event/queue tests and `git diff --check`. A successful run prints `5/5 offline gates`. Gate 1 itself contains the existing 9 regression checks.

### Browser tests

Start API, frontend, Postgres and storage/worker processes as required by your local setup; use a READY video owned by the test creator. `playwright.config.ts` is reused; no other Playwright config is installed.

Public-only authorization check (no credentials):

```sh
node scripts/run-stream-008-8.mjs --public
```

Authenticated **read-only** dashboard, period and video-detail tests (must have at least one creator video):

```sh
export STREAMLAB_E2E_PLAYBACK_EMAIL='creator-e2e@example.com'
read -rs 'STREAMLAB_E2E_PLAYBACK_PASSWORD?Şifre: '
echo
export STREAMLAB_E2E_PLAYBACK_PASSWORD
node scripts/run-stream-008-8.mjs --read
```

**Full live analytics write** (creates persistent playback analytics sessions):

```sh
export STREAMLAB_E2E_ANALYTICS_VIDEO_ID='<CREATOR-OWNED-READY-UUID>'
export STREAMLAB_E2E_ANALYTICS_WRITE=1
node scripts/run-stream-008-8.mjs --full
unset STREAMLAB_E2E_ANALYTICS_WRITE
unset STREAMLAB_E2E_PLAYBACK_PASSWORD
```

`--public` runs 1 test, `--read` runs 3 tests, and `--full` runs 4 tests, **without skipped tests**. `--full` rejects missing opt-in or fixture config before Playwright starts. Use a disposable test creator/video: the qualified playback record cannot be undone by the test runner. The test compares before/after all-time metrics rather than expecting a hard-coded count. No secrets are printed by the test code; do not share full Network request payloads or signed playback URLs.

Recommended fixture: an accessible READY video at least 60 seconds long, preferably PUBLIC, with a valid HLS asset. Confirm the video's owner matches the authenticated creator. If extensions block `/analytics/events`, reproduce with a clean Playwright browser context and document any remaining data gaps; do not bypass privacy settings in production.

### Acceptance criteria

- All 5 offline gates pass, including prior 9 checks, and HTTP tests pass.
- Browser public (1), creator authenticated (2 additional), analytics-write (1 additional) = **4 passed, 0 failed, 0 skipped**.
- Real `qualifiedView` event is acknowledged, `qualifiedViews` and `watchSeconds` increase for the owning creator; no playback regression.
- No access token/signed media URL/analytics capability appears in test output or logging.
- Isolation tests remain fixtures. Production JWT, long-term query performance, ad-blocker coverage and anti-fraud controls require separate assurance.
