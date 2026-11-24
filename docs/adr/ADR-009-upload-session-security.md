# ADR-009 — Secure video upload sessions and storage verification

- **Status:** Accepted (architecture; not implemented)
- **Date:** 2026-11-24
- **Milestone:** STREAM-004.1
- **Related:** ADR-003 (direct upload), ADR-004 (async processing), ADR-008 (cleanup/reconciliation)

## Context and existing design

StreamLab already has `Video`, `VideoUpload`, `MediaAsset`, `VideoRendition`, upload status/mode enums, two **private** S3-compatible buckets, a PostgreSQL-owned API, and an independent BullMQ worker. The current OpenAPI describes `POST /api/v1/videos/{videoId}/uploads` (initiate) and `POST /api/v1/uploads/{uploadId}/complete` (verify); **both remain planned** at STREAM-004.1.

Original bytes must **never pass through Express** and must not become public merely because the client reports upload completion. Existing ADR-003's direct-to-storage choice is retained; this ADR tightens lifecycle, upload-key immutability, access boundaries, and race handling.

## Decision — responsibility boundaries

1. **Browser:** Selects a local file, sends only metadata to the authenticated Express API, PUTs bytes to a presigned S3 URL, then calls the completion endpoint. The presigned URL is treated as a secret bearer capability and must not go to analytics, browser localStorage, error telemetry, or console logs. The browser gets **no S3 access keys**.
2. **API (JWT + active PostgreSQL session):** Validates that the user owns a non-deleted Video, that its status allows a new attempt, and that size/type/quota constraints hold. The API creates `VideoUpload` with unique opaque ID, its own storage key, expected size, expiry, and initial status in a transaction. Storage key and bucket are _never supplied by the client_.
3. **Object storage:** `streamlab-uploads` stores private incoming objects and verified originals; `streamlab-media` is reserved for separately authorized transcoded output. Object-store CORS limits which browser origins can send requests but is **not** access control. Only server identities sign URLs; production uses least-privilege identities rather than the local SILO root account.
4. **Completion API:** Re-authenticates and checks video ownership, upload state, expiry, and the object-store result. `HEAD` confirms object presence, expected size, and storage metadata. The service validates **actual bytes/content**, not only declared MIME/extension, before consumption. A declared SHA-256 checksum, when present, must be verified against storage-validated bytes. An S3 ETag alone is **not** accepted as an end-to-end file SHA-256 (particularly for multipart).
5. **Immutable promotion:** A short-lived presigned PUT can be used again to overwrite the _staging_ key before expiry. Completion must therefore not hand this mutable key to the worker. Use an authenticated server-side copy into a **new unguessable verified key** (or a backend-tested equivalent immutable/version-pinned operation), verify the promoted object's size/checksum, and persist only the verified key in `MediaAsset(ORIGINAL)`. Guard against source mutation with object versioning or conditional copy/validation supported by the provider. Do **not** mark `VERIFIED` or queue processing if those guarantees cannot be established. Never presign writes to verified keys.
6. **Worker:** Only verified, immutable original objects may be queued or probed. Full FFprobe/codec validation and FFmpeg transcoding arrive in the processing milestone. A successfully uploaded object is **not yet playable or published**.

## Upload limits (MVP decisions)

The machine-readable, **not-yet-enforced** policy is `docs/architecture/stream-004-1-upload-policy.json`.

- Allowed client-declared extension/MIME pairs: `.mp4`/`video/mp4`, `.webm`/`video/webm`; allowlist is an early filter, not a trust boundary. Final media format is checked server-side/worker-side before processing.
- Maximum original size **2 GiB**; minimum size **1 byte** (actual media must still pass validation). File names up to 255 characters are display-only and never become storage keys.
- Presigned URL TTL **10 minutes** (replay within that window remains possible); server upload-session TTL **24 hours**. Expiry of the URL is distinct from expiry of the session; an expired URL does not grant a renewal for the same mutable key. To retry, create a **new upload attempt and unique key**.
- **Single PUT at or below 100 MiB**. Files above 100 MiB up to 2 GiB use multipart in STREAM-004.7. This is a planned UX/API boundary: current OpenAPI describes only the single-PUT response.
- Multipart size **8 MiB per non-final part**, no more than 10,000 parts, numbered 1..N. Validate part boundaries, ETags/checksums and ownership server-side. Expired multipart sessions require `AbortMultipartUpload` and a cleanup/reconciliation job.
- At most **one active attempt per video** and an initial rate-limit budget of **20 started sessions per user per hour**, subject to monitoring; repeated abuse also needs storage/bytes quotas. Enforce concurrency atomically in the DB rather than relying solely on an application-side count.

> Important: A presigned PUT URL does not, by itself, enforce a file-size limit against an untrusted browser. Reject oversize declared requests _and_ verify actual object size at completion. Additional storage-level request constraints should be used if supported, but verification remains mandatory.

## State transitions and idempotency

| Entity      | Allowed progression                                                    | Notes                                                                                         |
| ----------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Video       | `DRAFT` → `UPLOADING` → `UPLOADED` → `QUEUED` → `PROCESSING` → `READY` | Worker stages follow ADR-004; failures may become `FAILED`. `DELETING` disallows new uploads. |
| VideoUpload | `INITIATED` → `UPLOADING` → `VERIFIED`                                 | `FAILED` and `EXPIRED` are terminal attempts; retry uses a **new** upload.                    |
| MediaAsset  | Original record created only for _verified/promoted_ object            | No active media pointer to staging key.                                                       |

- **Initiate:** Recheck owner + video status; atomic state transition and unique attempt creation; retry requests cannot select a previous key. If one active upload exists, return `409` and do not issue another write grant.
- **Complete:** `POST /api/v1/uploads/{uploadId}/complete` is idempotent for the same successfully verified upload; a competing completion must not insert a duplicate `MediaAsset` or queue twice. Treat `VideoUpload.status` and DB constraints/transaction guards as source of truth. If status is expired, deleted, or owned by another user, reject (use `404` for foreign resources).
- **Interrupted workflow:** Retry storage checks safely, mark expired attempts, remove abandoned staged objects, abort unfinished multipart IDs, and reconcile DB verified-but-not-enqueued uploads. Never assume exactly-once BullMQ delivery.
- **Delete:** If the Video becomes `DELETING`, no new signing or completion may proceed; outstanding presigned URLs can remain valid until expiry, so staging objects must remain untrusted and be cleaned later. Already-verified outputs are cleaned in a separate storage lifecycle workflow.

## Planned endpoints (no runtime code in this milestone)

| Endpoint                                  | Role       | Result                                                                                     |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `POST /api/v1/videos/:videoId/uploads`    | JWT, owner | `201`, upload ID, mode, short-lived signed URL and required headers (single PUT initially) |
| `POST /api/v1/uploads/:uploadId/complete` | JWT, owner | `202`, only after server-side object verification and durable processing intent            |
| Multipart create/sign parts/finish/abort  | JWT, owner | Deferred to STREAM-004.7; explicit DTO/OpenAPI extensions                                  |

The **signed method, key, expiry, content type, and required headers** must be exact. Use compatible S3 SigV4 signing; a URL must not give list/read/delete access to other objects. For browser CORS, do not use wildcard origins or public ACLs. Since application endpoints use an in-memory bearer JWT, require existing authenticated session/authorization checks for initiation/completion and apply CSRF protection to any cookie-authenticated mutations introduced later.

## Threats, mitigations and verification gates

See `docs/security/stream-004-1-upload-threat-model.md` and `docs/development/stream-004-1-acceptance.md`. In particular, test two users, expired sessions and URLs, double completion, oversized object after a falsely small declaration, MIME spoofing, repeated PUT after completion, race with delete, concurrent initiation, untrusted ETag, and orphan multipart cleanup.

## Consequences and non-goals

The design scales upload bandwidth without streaming file bytes through Express, but requires two storage-key phases (staging and verified) and cleanup. Server-side copies may incur storage cost; provider compatibility for conditional-copy/version-pinning and checksums **must be integration-tested on local SILO** before claiming full implementation. If the provider cannot support safe promotion, use a version-pinned or server-streaming verification alternative instead of weakening the invariant.

STREAM-004.1 changes no database schema, API route, TypeScript runtime, or bucket permissions. Runtime development begins with STREAM-004.2–004.7. FFprobe, FFmpeg and HLS are future milestones.

## References

- [AWS: presigned URLs, expiration, overwrite and checksums](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [AWS: multipart constraints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html)
- [AWS: aborting incomplete multipart uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/abort-mpu.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
