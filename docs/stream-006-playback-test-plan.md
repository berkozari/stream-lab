# STREAM-006.7 — Playback regression test plan

## Scope

- Existing API playback authorization, expiry/version, HLS playlist parsing, segment signing, HTTP response headers and CORP/CORS rules
- Existing frontend quality selection, loading/buffering/error/retry, token renewal and continuity unit tests
- Playwright with a **pre-existing READY video** to verify browser media loading, direct signed S3 segment fetch, and no API `302` segment hop
- Optional 2+ rendition fixture for manual quality selection; optional 60-second capability test

## Offline regression (no live media fixture)

From the monorepo root:

```bash
node scripts/verify-stream-006-7.mjs
```

Expected: `11/11 offline gates passed`. These gates do **not** establish real browser playback success.

## Playwright (real browser + local services)

Run API and frontend using existing project development commands. Ensure PostgreSQL, Redis, media storage and the existing READY fixture are available. The fixture is read-only: the E2E suite does not create, modify or delete videos. A PUBLIC READY fixture can be tested without login. For a PRIVATE READY fixture, use an authorized account via environment variables, not hardcoded credentials.

```bash
export STREAMLAB_E2E_PLAYBACK_VIDEO_ID='<READY-video-UUID>'
# Optional: a READY video with at least two renditions
export STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID='<multi-rendition-video-UUID>'
# Only for private videos; omit both for public videos
# export STREAMLAB_E2E_PLAYBACK_EMAIL='your-test-user@example.invalid'
# export STREAMLAB_E2E_PLAYBACK_PASSWORD='...'
node scripts/run-stream-006-playwright.mjs
```

The runner refuses to report success when the required READY video ID is absent or malformed. The ABR test explicitly skips if its fixture is not supplied. The suite also checks a non-existent video cannot be watched.

For token renewal E2E, restart the API with `PLAYBACK_TOKEN_TTL_SECONDS=60`, use a long READY fixture, and additionally set `STREAMLAB_E2E_PLAYBACK_RENEWAL=1`; the renewal test is opt-in because it waits for a second playback request.

Do not paste any signed `token=` or `X-Amz-Signature=` query values into test reports. When sharing failures, share status codes, URL _paths_ without query strings, browser error categories and API/worker logs with secrets redacted.

## Coverage boundary

Existing unit/HTTP tests simulate service dependencies and do not prove MinIO works. Playwright requires actual media, Chromium browser binaries and the existing Playwright config and dev services. A passing single-rendition playback test does not establish multi-rendition ABR behavior; use the separate ABR fixture. Token renewal behind tab suspension, resilience after storage outage, and production CDN behavior still need separate validation.

Once offline gates and required Playwright scenarios pass, finish with `git diff --check` and review changes before STREAM-006.8 closure.
