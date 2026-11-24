# STREAM-004.4 — Upload Session API

## Scope

`POST /api/v1/videos/:videoId/uploads` requires an active JWT, video ownership and validated upload metadata. The 201 response includes `uploadId`, `videoId`, `mode`, `status`, and `expiresAt`. **No presigned URL or object key is returned.** STREAM-004.5 introduces the separate authorized URL-signing operation; the previous URL-bearing DTO remains reserved for that operation.

- Accept `video/mp4`/`.mp4` and `video/webm`/`.webm`, 1–100 MiB for the initial SINGLE flow.
- 100 MiB–2 GiB is deferred to multipart in STREAM-004.7; the session API returns 413 for over-100-MiB requests.
- Use `req.auth.userId`, not `ownerId` from the request.
- Match foreign, missing and deleted videos with the same `404 VIDEO_NOT_FOUND` response.
- New upload sessions are `INITIATED`, expire 24 hours after creation, and change the video from `DRAFT` to `UPLOADING`.
- Only `DRAFT` or `UPLOADING` videos can start a SINGLE upload. A live session returns `409 UPLOAD_ALREADY_ACTIVE`.
- Stale sessions are marked `EXPIRED` when the next initiation arrives; the new attempt gets a unique staging key.
- The database transaction locks the owner-scoped `Video` row (`SELECT ... FOR UPDATE`) before examining upload sessions. This serializes concurrent requests without a schema migration.
- `storageKey`, original filename, checksum and declared byte count remain server-side. The original filename is validated but not persisted by this schema, and no S3 object is written.

## Limits

The session only records declarations; none of these establish that the object exists or is safe. SERVER-SIDE object verification, immutable promotion and queuing remain STREAM-004.6 and later.

## Tests

```bash
pnpm format
pnpm verify:upload:session
pnpm test:upload:session
pnpm check
bash scripts/infra-up.sh
pnpm smoke:upload:session
```

The PostgreSQL smoke test uses a temporary user/video, races two requests against the same video, checks one winner, tests stale-session replacement, and removes its records. No API listener or S3 upload is required for this particular smoke test.

## Next

STREAM-004.5 will create `POST /api/v1/uploads/:uploadId/sign` and sign a 10-minute S3 PUT URL after checking current user ownership, active upload state and expiry. Signatures are short-lived bearer capabilities and must not be logged or cached.
