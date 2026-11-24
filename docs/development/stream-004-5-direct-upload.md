# STREAM-004.5 — Authorized presigned PUT & direct staging upload

## API lifecycle

1. Authenticated user creates a SINGLE upload session (`POST /api/v1/videos/:videoId/uploads`), STREAM-004.4.
2. Authenticated user requests `POST /api/v1/uploads/:uploadId/sign` with `{ "contentType": "video/mp4" }` or `video/webm`. No storage key or checksum may be chosen by the browser.
3. API verifies **current** JWT session, ownership via the Video relation, non-deleted video, `UPLOADING` video state, SINGLE mode, unexpired `INITIATED`/`UPLOADING` session and expected size <= 100 MiB. Missing/foreign upload returns 404.
4. Server uses the **stored** SHA-256 checksum when available and signs only the server-created `staging/<videoId>/<uploadId>/source` key. Response returns `method`, `uploadUrl`, required `headers` and `expiresAt` with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
5. Browser uses native `fetch` (not the authenticated Axios instance) to PUT **raw file bytes** to the S3-compatible endpoint with the exact signed headers, `credentials: omit`, redirects disabled and no Authorization header.
6. Successful PUT leaves the session `UPLOADING`. **No trust is granted to these bytes** until STREAM-004.6 verifies the actual object size, magic bytes, optional full SHA-256, then immutably promotes it. A client's 200 from S3 is not equivalent to a verified uploaded video.

## Security and known constraints

- Signed URLs are bearer capabilities: they can be re-used and overwrite the same staging key until expiry. Do not log, cache, persist, expose in analytics, or attach them to error reports. Do not let FFmpeg process directly from a browser-writable staging key.
- SigV4 expiry is **at most 600 seconds** and is also bounded by the upload session expiry. Re-signing does not extend the 24-hour session.
- The 004.4 `VideoUpload` schema does **not** persist declared MIME. The 004.5 sign request revalidates an allowed MIME and binds it in the SigV4 signed `Content-Type`; declared MIME and filename are _not_ evidence of actual media type. 004.6 must check the bytes.
- An expected file size is recorded in PostgreSQL but **is not enforced by the presigned PUT**. 004.6 must compare the real S3 object size against `expectedSizeBytes` and the hard limit; do not rely solely on Content-Type or S3 ETag.
- If `checksumSha256` was declared on initiation, the server signs `x-amz-checksum-sha256` with that stored value. The browser must send the exact returned header.
- Storage access is private. **S3_ENDPOINT must be accessible from the browser**, not a Docker-only hostname. A SigV4 URL cannot safely be edited to point at another host after signing.
- Browser-origin direct PUT requires S3 bucket CORS: allow the Web origin (local `http://localhost:5173` and/or `http://127.0.0.1:5173`), `PUT` and `OPTIONS` preflight behavior, and the `Content-Type` and `x-amz-checksum-sha256` request headers. Do not use blanket `*` origins in production. CORS is a browser constraint; a Node-based smoke test does not validate browser CORS.
- A revoked session cannot request a _new_ URL; already-issued presigned URLs remain usable until expiry. Storage byte verification and staging isolation are mandatory.

## Test commands

```bash
pnpm format
pnpm verify:upload:sign
pnpm test:upload:sign
pnpm check
bash scripts/infra-up.sh
pnpm smoke:upload:sign
```

The S3 smoke creates temporary user/video/upload records, signs a URL and PUTs a small probe. Probe bytes are **not a real video** and are never verified, promoted, enqueued or processed. Staging and test records are cleaned afterward.

## Next

STREAM-004.6: upload completion, streamed byte verification, magic-byte/media validation, immutable promotion and only then processing readiness.
