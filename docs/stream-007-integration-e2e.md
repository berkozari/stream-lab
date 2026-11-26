# STREAM-007.6 — Discovery & Watch History Integration / E2E

## Scope

This is a **test-only** addition; production web/API routes, Prisma schema and playback behavior are unchanged.

### API HTTP suite (`watch-progress.http.test.mjs`)

Isolated Express router and in-memory store verify:

- Missing authentication is rejected on progress, history and continue endpoints.
- Responses use `Cache-Control: private, no-store`.
- Two injected viewer identities cannot read one another's progress/history.
- Invalid progress body (including injected `userId`) and malformed IDs are rejected.
- History pagination cursor is scoped to the viewer and list mode.

The injected auth middleware is **not** a real JWT verifier. Existing auth/security regressions remain responsible for verifying JWT signatures, token revocation and active sessions. The in-memory test does **not** exercise PostgreSQL or S3.

### Playwright suite (`discovery-watch-history.spec.ts`)

- **Public**: home discovery, category seed/options, filtered search/empty state and browser history.
- **Public**: unauthenticated visits to `/history` and `/continue-watching` go to login.
- **Authenticated**: both private lists load with successful API responses.
- **Authenticated (writes test data)**: seek -> authenticated PUT -> history -> continue -> persisted GET -> resumed playhead.

The last scenario writes watch progress for the provided video on the provided user account. Use a **dedicated test account and existing READY video of at least 90 seconds**; do not use a production account. The test intentionally does not delete progress records or create media. It may change a prior completion state.

## Setup and commands

From the repository root:

```bash
pnpm exec prettier --write \
  apps/api/tests/integration/watch-progress.http.test.mjs \
  apps/web/tests/e2e/discovery-watch-history.spec.ts \
  scripts/verify-stream-007-6.mjs \
  scripts/run-stream-007-6.mjs \
  docs/stream-007-integration-e2e.md

node scripts/verify-stream-007-6.mjs
```

For browser checks, start API, database, Redis and the frontend as in existing local development, with a seeded category table, and ensure the test account has access to the READY video. A worker is unnecessary for already READY fixtures.

```bash
node scripts/run-stream-007-6.mjs --public
```

For the full four-test run, in the **same terminal**:

```bash
export STREAMLAB_E2E_PLAYBACK_EMAIL='test-account@example.com'
read -rs 'STREAMLAB_E2E_PLAYBACK_PASSWORD?Test password: '
echo
export STREAMLAB_E2E_PLAYBACK_PASSWORD
export STREAMLAB_E2E_PLAYBACK_VIDEO_ID='<READY-video-UUID>'
export STREAMLAB_E2E_WATCH_WRITE=1
node scripts/run-stream-007-6.mjs --full
unset STREAMLAB_E2E_PLAYBACK_PASSWORD STREAMLAB_E2E_WATCH_WRITE
```

The script fails _before starting Playwright_ if any of the full-suite prerequisites are missing; it does not silently count skipped authenticated or writable scenarios as passed.

## Acceptance

- Offline: **12/12 gates PASS** (the number of assertions within each gate varies).
- Browser: **4 passed, 0 failed, 0 skipped** for `--full`; **2 passed** for `--public`.
- Previously passing STREAM-006 HLS, quality and token refresh regressions remain green.
- No server auth, media storage URLs, private API credentials or recorded traces should be pasted into chat unredacted.

## Troubleshooting

- Missing category choices: check `/api/v1/categories` and the category seed.
- Login fails: ensure both env vars are exported in the **Playwright runner's terminal**; interactive browser login does not share its session.
- Playback fixture never loads: require a `READY`, accessible video (90+ seconds) with working S3/media service.
- Resume remains at zero: inspect the `GET /users/me/watch-progress/:videoId` response value and the HTML video `currentTime` after metadata is ready; check write-response value first.
- Playwright report may contain signed URL query strings and session details. Redact before sharing.
