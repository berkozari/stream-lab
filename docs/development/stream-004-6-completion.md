# STREAM-004.6 — Upload Completion & Verification

## Endpoint

`POST /api/v1/uploads/:uploadId/complete` with an **active Bearer JWT** and no request body. Returns `200` with `data: { videoId, uploadId, status: "UPLOADED" }` (not `QUEUED`). It does **not** enqueue FFmpeg processing. The browser does not supply a storage key, content length, checksum, or filename at completion.

## Trust boundaries

1. Resolve the `VideoUpload` by ID and **owner of the related video**. Reject an expired, non-SINGLE, already VERIFIED/FAILED/EXPIRED upload, soft-deleted video, or non-UPLOADING video. Unknown and foreign IDs return the same 404.
2. HEAD the private staging object. Its Content-Length must equal the session's expected bytes. HEAD metadata, ETag and Content-Type are _not evidence of file integrity_.
3. GET staging with `If-Match` using its ETag. Stream through a bounded byte counter and SHA-256 hasher. Require a recognizable MP4 `ftyp` or WebM EBML signature. Compare against the session's optional SHA-256 checksum (if supplied at session creation).
4. Copy to `streamlab-media` with a new unpredictable `originals/<video>/<upload>/<uuid>/source` key and **`CopySourceIfMatch`**. Never sign browser PUT requests to this bucket/key. Re-GET the destination and repeat byte/hash/signature verification. A source overwrite race must fail rather than promote unchecked bytes.
5. In one PostgreSQL transaction, conditionally transition `Video UPLOADING → UPLOADED`, `VideoUpload INITIATED/UPLOADING → VERIFIED` with `completedAt`, and create `MediaAsset(kind=ORIGINAL)` referencing **only the verified** media key. Concurrent completions may copy independently, but only one may commit. The losing attempt deletes its uncommitted media copy.
6. **Do not** delete staging inside the completion request: a presigned URL can still overwrite staging until expiry. Configure private staging lifecycle expiry/garbage collection in the storage operational plan; never process staging data as verified. The verified media bucket must be writable only by trusted server/worker identities, not by the browser or presigned upload URLs.

## Supported limits

Only single PUT up to **100 MiB** at this milestone. Multipart remains planned for STREAM-004.7. The limit is rechecked from streamed bytes to avoid trusting a declared size or HEAD response.

## Limitations / next milestones

- MP4 `ftyp` and WebM EBML signatures do **not** prove that a file is decodable, playable or free from malicious payloads. A sandboxed ffprobe/FFmpeg worker will perform format inspection in the processing milestone.
- No antivirus/malware scanner or media transcoding is implemented here.
- Orphaned verification copies after process crashes and expired staging objects require periodic lifecycle cleanup (future operations hardening). If a copy is created and the process is interrupted before database commit, a compensating cleanup task must eventually remove it.
- A checksum omitted by the client is still computed for validation of the media copy, but is not persisted in the current Prisma schema (no migration this milestone).
- SILO/S3-compatible deployments must support `CopyObject` with `CopySourceIfMatch`; test this via smoke against the exact deployment.

## Local acceptance

```bash
pnpm format
pnpm verify:upload:complete
pnpm test:upload:complete
pnpm check
bash scripts/infra-up.sh
pnpm smoke:upload:complete
```

Smoke uploads a deliberately tiny MP4 **signature probe**, not a fully playable movie. It tests the trust boundary and database transitions, not FFmpeg decode validity.
