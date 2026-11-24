# STREAM-004.8 — Creator Video Upload UI

## Scope

The Creator video list now exposes **Dosya yükle** for owned `DRAFT` and `UPLOADING` videos. UI supports:

- Client-side MP4/WebM filename/MIME and 1 byte–2 GiB size checks (server repeats authoritative validation).
- `SINGLE` for at most 100 MiB and `MULTIPART` for more than 100 MiB (8 MiB parts).
- Authenticated API calls through the existing Axios instance (in-memory access JWT and existing refresh/session logic).
- Browser-direct presigned PUT to the private uploads bucket using **XMLHttpRequest with `withCredentials=false`**, never the API Axios instance. No JWT, cookie, or CSRF headers passed to S3. XHR upload progress powers the UI; 100% is shown only after server verification.
- Multipart recovery: the browser stores only owner/video-scoped session metadata (IDs, file fingerprint, expiry, per-part SHA-256 and ETags). It never stores the file itself, presigned URLs, API tokens, or S3 UploadId.
- After a reload or pause, the owner must select the same local file. Before skipping any part, the UI compares the part's SHA-256 with its own persisted digest **and** the current S3 ListParts ETag/length. If the local record is missing or digest differs, the part is PUT again, not blindly skipped. Incomplete PUTs are not marked uploaded.
- Each failed PUT is re-signed and retried up to 3 total attempts; no infinite automatic retry. Final receipts are fetched again from S3 via authenticated API, and the server independently validates sizes and receipts before assembling and verifying.
- Multipart abort uses authenticated `DELETE /uploads/:uploadId/multipart`. Local recovery metadata is cleared only after the API returns success. Pausing uses XHR AbortController and retains the session.

## Known boundaries

- There is **no single-PUT abort API**. Pausing a SINGLE transfer leaves an active server session; resume reuses the same upload ID and re-signs. Do not clear it and create another upload immediately (the backend rejects concurrent active sessions). Expiry is enforced server-side.
- Browser `localStorage` can be unavailable or cleared. The transfer still works, but reload recovery then isn't guaranteed; the server's 24-hour session and cleanup policy still apply.
- Filename, size, MIME and lastModified are **not cryptographic identity**. The additional per-part SHA-256 prevents silently reusing stored bytes with changed content. Full-file client checksum declaration isn't part of this milestone; backend verifies streaming size and content signature and computes its own SHA-256.
- UI sends parts sequentially to limit browser memory and simplify recovery. Concurrent multipart scheduling, browser E2E, offline interruption and expired-session UX hardening are follow-up work in STREAM-004.9.
- Presigned S3 requests require bucket CORS to permit frontend origin and `PUT`, and **ExposeHeaders: [ETag]** for multipart. `Access-Control-Allow-Credentials` is unnecessary for storage uploads.
- STREAM-004.8 stops at `UPLOADED` verified original; FFmpeg processing and playback are separate milestones.

## Validation

Run `pnpm format`, `pnpm verify:web:upload`, `pnpm test:web:upload`, and `pnpm check`. In the running app, manually exercise a small MP4 and a larger-than-100-MiB MP4 (pause, reload, reselect identical file, resume, complete, and abort another incomplete multipart session). Browser E2E coverage belongs to STREAM-004.9.
