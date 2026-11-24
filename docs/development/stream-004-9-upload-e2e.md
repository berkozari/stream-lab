# STREAM-004.9 — Upload Security, Integration & Browser E2E

## Scope

The suite performs live browser/API/S3 checks, including browser single PUT and
server-side verification, ownership of signing/completion, invalid-file rejection,
and an interrupted upload resumed without a second session. A >100-MiB multipart
browser E2E is explicitly opt-in because it transfers 13 parts and allocates a
large temporary browser file. Existing API unit/integration tests and STREAM-004.7
SILO smoke remain part of acceptance; E2E is not a replacement for them.

No new API endpoint, dependency, Prisma schema, or unsafe test-only bypass is added.

## Prerequisites

- Run from StreamLab monorepo root; commit your code first.
- PostgreSQL, Redis and SILO are ready (`bash scripts/infra-up.sh`).
- `pnpm --filter @streamlab/contracts build` and `pnpm check` pass.
- Chromium for Playwright is installed (`pnpm exec playwright install chromium`, if required).
- S3 `streamlab-uploads` bucket CORS permits browser origin `http://127.0.0.1:5173`
  and `http://localhost:5173`, request methods PUT/OPTIONS (where supported by
  the backend), and exposes the `ETag` response header. Also check the SILO
  endpoint returned in presigned URLs resolves inside the browser.
- Set up the two private buckets; do not make the original media bucket public.

## Commands

```sh
pnpm verify:upload:e2e
pnpm check
pnpm test:upload:e2e
# Optional, transfers >100 MiB and may require several minutes:
pnpm test:upload:e2e:large
```

The normal E2E command intentionally **skips** the >100-MiB test. This is an explicit
opt-in, not a passing multipart browser E2E claim.

## Negative/security acceptance

1. Anonymous / cross-owner upload signing and completion do not expose signed URLs.
2. Browser direct S3 requests do not carry Authorization, cookie or CSRF headers.
3. Invalid extension/MIME is rejected before an upload session is created.
4. Interrupted single PUT retains the same server session; reload/reselect resumes.
5. Valid small MP4 signature passes real browser PUT and server byte/hash checks;
   no transcoding or media playback is asserted (STREAM-005).
6. Large path: part signing, ETag CORS, actual S3 multipart assembly and verified copy.
7. All E2E identities use `streamlab-upload-e2e-<uuid>@example.invalid`; cleanup
   refuses all other names and deletes matching staging, verified originals and DB
   records. If cleanup reports a failure, investigate orphan storage objects.

## Remaining operational checks (manual)

- Expired upload and presigned URL with clock advancement in an isolated integration
  fixture; do not manipulate production server clock or storage objects.
- Repeat a timed-out completion request after S3 assembly: it must not create two
  ORIGINAL assets or reveal objects from other users.
- `AbortIncompleteMultipartUpload` bucket lifecycle policy and stale-session cleanup
  job require an operational configuration review; this test patch does not silently
  claim or install scheduled cleanup.
- CORS preflight fails closed for unapproved origins; verified original bucket has
  no browser write grant; URLs do not enter application logs or persistent storage.

## Manual UI checklist

Create a draft, upload a small MP4; check progress then `UPLOADED`. Create another
and upload >100 MiB; pause during upload, reload, reselect identical file, resume,
and verify completion. Repeat with `İptal` to confirm multipart abort. Verify login
redirect after logout, and that a second account does not see the creator video.
