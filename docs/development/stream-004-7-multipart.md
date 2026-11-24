# STREAM-004.7 — Multipart Upload & Recovery

## Scope

Multipart support for uploads greater than 100 MiB and at most 2 GiB. Each part is 8 MiB except the last. No Prisma migration: `VideoUpload.uploadMode`, `storageUploadId`, `expectedSizeBytes`, `checksum`, and `expiresAt` were defined in STREAM-001.5.

## API

1. `POST /api/v1/videos/:videoId/uploads/multipart` — Create a MULTIPART session. JWT + owned video + strict metadata; returns upload ID, part size, expiry. S3 UploadId is never returned.
2. `POST /api/v1/uploads/:uploadId/parts/sign` — `{ "partNumber": 1 }`; JWT + owned active session; 10 minute maximum presigned UploadPart PUT URL. Browser sends only the part bytes using unauthenticated `fetch` (`credentials: 'omit'`).
3. `GET /api/v1/uploads/:uploadId/parts` — S3-backed list of uploaded parts for recovery. Exposes part number, ETag and size only to the owner.
4. `POST /api/v1/uploads/:uploadId/multipart/complete` — Receives ordered part ETags. Server independently calls ListParts and verifies every ETag and exact byte count. Completes the S3 upload, marks assembly in PostgreSQL, and calls STREAM-004.6 streamed SHA-256/signature validation and verified-original promotion. Returns UPLOADED.
5. `DELETE /api/v1/uploads/:uploadId/multipart` — Closes the DB session before issuing S3 abort, so no new URLs can be signed. When S3 abort fails, retry the DELETE for cleanup.

## Trust boundaries

- Never accept browser-generated S3 UploadIds, storage keys, owner IDs or bucket names.
- ETags identify S3 parts; **they are not full-file SHA-256 hashes**. Real content verification remains mandatory after S3 assembles parts.
- A part PUT can be retried with the same part number, overwriting its earlier bytes. During recovery, list parts again and use S3's current ETag. Subsequent completion verifies receipts against fresh ListParts.
- Multipart presigned URLs expire at the earlier of 10 minutes or upload-session expiry.
- Empty/oversized/wrongly ordered parts and wrong ETags reject completion. ListParts size validation enforces 8 MiB per non-final part.
- A completed multipart upload cannot be resumed via UploadPart. If the process crashes just after S3 assembly, retry multipart completion with the existing receipts; the API may recover by checking the assembled staging object's size. If the DB already records `storageUploadId = NULL`, use `POST /api/v1/uploads/:uploadId/complete` to retry the trusted verification.
- For durable cleanup, configure a bucket lifecycle rule `AbortIncompleteMultipartUpload` for the uploads bucket (e.g., after 2 days) and operationally sweep expired `VideoUpload` sessions. The API abort endpoint alone cannot guarantee cleanup after process crashes.
- SILO and actual AWS S3 must be validated separately for conditional copy behavior; `HEAD` metadata alone does not establish the authenticity of a video.
- Expose `ETag` in storage CORS response headers (`ExposeHeaders: [ETag]`), and permit the client origin for `PUT` with appropriate request headers. E2E browser tests belong in STREAM-004.9.

## Next

STREAM-004.8 integrates upload progress/recovery controls in Creator UI. STREAM-004.9 covers end-to-end stress, expiration and interrupted multipart cleanup. Uploads are still **not queued for FFmpeg**.
