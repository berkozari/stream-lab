# STREAM-006.8 — HLS playback: final regression & closure

## Scope and status

This document is the exit checklist for **STREAM-006: HLS Player & Playback** in StreamLab. The implementation is a React/TypeScript player using hls.js (with native HLS fallback), Express protected playback API, signed short-lived playback capabilities, and private object storage for HLS segments. It does not claim production deployment or CDN validation.

### Completion history (based on development and user-reported tests)

| Task                                                  | Outcome                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 006.2 Secure playback API                             | Implemented; protection for video visibility, READY state, signed HLS access                           |
| 006.3 React HLS player                                | Implemented; resolved CORP/CORS incompatibilities and browser HLS selection                            |
| 006.4 Automatic/manual quality selection              | User confirmed working                                                                                 |
| 006.5 Loading, buffering, retry, video status polling | User confirmed working                                                                                 |
| 006.6A Token renewal and continuity                   | User confirmed 7/7 browser scenarios PASS (60-second TTL fixture)                                      |
| 006.6B HLS signing concurrency and lazy watch route   | User confirmed installation and tests passed                                                           |
| 006.7 API/frontend offline and Playwright E2E         | User reported tests passed; inspect final test output for 4 passed / 0 skipped and 11/11 offline gates |
| 006.8 Closure                                         | Run final verification and merge checklist below                                                       |

## Reproducible gates

From the monorepo root:

```bash
# Lint/format and 11 existing 006.7 offline regression gates, plus Git safety audit
node scripts/verify-stream-006-8.mjs

# Optional: re-run the real browser suite if test fixtures and live services exist
# Requires READY, ABR READY UUIDs, STREAMLAB_E2E_PLAYBACK_RENEWAL=1
# and API launched with PLAYBACK_TOKEN_TTL_SECONDS=60.
node scripts/verify-stream-006-8.mjs --e2e
```

**Do not confuse a structural check with actual test execution:** `--inspect-only` only checks Git and required files. `--e2e` refuses to run with missing ABR/renewal fixture environment values to avoid silently passing skipped tests. The regular offline gate can take several minutes. Avoid sharing credentials, bearer tokens, presigned query strings, or full HTTP request URLs in logs/issues.

## Browser acceptance criteria

- [ ] Unknown video returns a safe error; no player element.
- [ ] Authorized `READY` video loads HLS manifest and direct signed storage segments; no API segment 302 hop.
- [ ] Viewer can switch to a manual rendition and back to automatic quality.
- [ ] In 60-second TTL mode, playback capability renews before expiry without restarting playback or losing the playhead.
- [ ] Paused playback remains paused across renewal; manual quality choice persists (manual browser check).
- [ ] Offline/error → user retry recovers when service returns (manual browser check).
- [ ] `QUEUED`/`PROCESSING` status polling stops on `READY` (manual browser check).

## Security and performance handoff

1. **Private media caveat:** presigned S3 segment URLs that have already been issued may remain usable until their independent expiry even if a video's visibility is changed or a playback capability is revoked. This is a known limitation of signed direct-media links; do not describe revocation as instantaneous. Avoid enabling public bucket listing/read access.
2. Keep `PLAYBACK_SIGNING_SECRET`, refresh/cookie secrets, storage credentials and auth tokens out of Git; do not paste signed `X-Amz-*` or `token=` URL query parameters into tickets.
3. Verify `PLAYBACK_TOKEN_TTL_SECONDS` is back to the intended non-test configuration after using 60-second renewal tests. Restart the API and verify actual runtime config rather than assuming a shell variable was cleared.
4. The HLS quality selector's actual selected rendition depends on available master-playlist levels; ABR adaptation depends on client conditions.
5. Route lazy loading and a concurrency ceiling for playlist URL signing improve startup and heavy-playlist behavior, but **do not** establish measured latency, load capacity, CDN performance or a production SLO.
6. Additional production hardening to consider later: key rotation/revocation design, presigned URL TTL vs. manifest caching semantics, CDN edge authorization, range/CORS behavior, privacy changes during an active session, cross-origin browser matrix, and long-playback load tests.

## Git pre-merge checklist

```bash
# Observe only; no destructive cleanup
 git status --short
 git diff --check
 git diff --cached --check
 git diff --stat
 git branch --show-current
 git diff --name-only
 git ls-files '*test-results*' '*playwright-report*' '*.env*'
```

- [ ] Inspect changes; check that `.env`, credentials, generated output, trace ZIPs and local media are not staged or tracked.
- [ ] Confirm required tests pass (include real browser output in the PR description, **not** signed URLs or credentials).
- [ ] Review `package.json` and `pnpm-lock.yaml` if dependencies changed; ensure lockfile matches installed dependencies.
- [ ] Commit on the feature branch, push, create PR, review CI and merge using your repository's normal process; **the script does not commit, push, clean or merge automatically**.
- [ ] Confirm branch after merge and prepare STREAM-007 feature work only after checks and review.

### Example PR summary

**STREAM-006: Secure HLS playback & adaptive quality**

Implemented secure playback capability/HLS access with short-lived token renewal, direct signed private object-storage segments, adaptive/manual quality selection, robust loading/error/retry UX, background processing-status polling, and bounded segment signing plus lazy watch route. Validated by API/frontend regression and real-browser tests for authorized playback, direct segment fetch, ABR switching and renewal continuity. Known limitation: previously issued presigned segment URLs can remain usable until expiry.

## Next milestone

**STREAM-007 — Discovery, search, categories and watch history.** Do not begin the feature on an unreviewed/unfinished 006 branch.
