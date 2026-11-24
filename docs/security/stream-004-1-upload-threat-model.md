# STREAM-004.1 — Upload threat model

**Scope:** user file → browser → short-lived S3 write grant → private staging object → verified immutable original → async processing intent. All controls in this document are **requirements for later implementation**, not claims that current endpoints enforce them.

## Trust boundaries

1. Browser file name, declared MIME, claimed byte length, and checksum are **untrusted**. The API validates declarations; storage + content verification establish facts.
2. Authenticated API owns DB identifiers, object key generation, authorization, and signing. Access JWTs, refresh cookies and storage credentials are separate secrets.
3. Presigned upload URLs are **bearer capabilities** that can be replayed until expiry. They must be scoped to one method/key and excluded from logs and telemetry.
4. Storage receives attacker-controlled media bytes. It must be private; asynchronous parsers/FFprobe/FFmpeg must treat bytes as hostile and run with strict resource limits.
5. The DB transition to `VERIFIED` is a security boundary: only after a stable immutable original is verified may the worker read it.

## Abuse cases and required defenses

| Threat                         | Attack example                                             | Required defense                                                                                      | Later verification                            |
| ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| BOLA/IDOR                      | User B initiates or completes upload for A's private video | `requireAuth` + active session + owner lookup on **every** action, return resource-hidden `404`       | Unit/HTTP: foreign ID rejected                |
| Unauthorized storage write     | Client chooses bucket/key                                  | Server-generated opaque upload ID and staging key; no path traversal, never sign verified prefix      | Inspect signed request and storage ACL        |
| Invalid or dangerous media     | `.mp4` suffix with executable/non-media bytes              | Extension/MIME allowlist plus server/worker byte & media probe validation; isolated worker            | MIME-spoof sample rejected                    |
| Size bypass                    | Client declares 5 MiB but uploads 2 GiB                    | Admission check + storage HEAD exact byte-size check + hard quotas                                    | Oversize completion rejected, object removed  |
| URL disclosure/replay          | Upload URL pasted in analytics or reused                   | Short TTL; no logging; verified key distinct from writeable staging; conditional copy/version-pinning | Re-PUT does not alter accepted original       |
| Race during completion         | Staging changes between HEAD and Copy                      | Conditional source version/ETag or tested immutable promotion with final checksum verification        | Concurrent PUT + complete integration         |
| Double completion              | Two `complete` calls queue two processing jobs             | Guarded DB status transitions, unique constraints/idempotency, durable work intent                    | Concurrent completion results in one original |
| Concurrent initialization      | Two tabs create uploads for same video                     | Transactional active-attempt rule / row-level guard                                                   | One active attempt only                       |
| Expired multipart storage leak | Browser abandons upload after 5/10 parts                   | Abort multipart, periodic cleanup, storage lifecycle if supported                                     | Parts disappear and DB reaches EXPIRED        |
| Publishing too early           | Upload declared complete without bytes existing            | HEAD + checksum/content verification and `MediaAsset(ORIGINAL)` before durable processing intent      | Empty/missing key returns error               |
| Delete race                    | Presigned URL still valid after Video soft delete          | Completion checks `deletedAt`, marks/cleans staging; no worker action                                 | Delete during PUT cannot publish              |
| Bucket exposure                | Anonymous read of original, CORS assumed sufficient        | Private bucket policy, least-privilege app IAM, never web credentials                                 | Unsigned GET denied                           |
| Resource exhaustion            | Many sessions, huge multipart, decompression/probe abuse   | Per-user session/byte quotas, parallel limits, timeouts and parser sandbox                            | Rate-limit and worker-resilience tests        |

## Fail closed

- A storage timeout or incompatible conditional-copy capability **must not** result in `VERIFIED`.
- Database commit and queue enqueue may fail independently; save durable intent and reconcile (ADR-004).
- A presigned URL may still be valid after logout/delete; revoking the API session cannot revoke the URL immediately. Use short TTL, staging separation, and cleanup.
- S3 object ETag is **not** assumed to equal MD5 or SHA-256 for multipart objects.
- Use private production storage credentials scoped to required upload verbs/prefixes; local root credentials are development-only.

## Existing infrastructure evidence

- `compose.yaml` has a local S3-compatible storage service with loopback-only host port.
- `infra/storage/cors/uploads.xml` permits local Vite origins and PUT/GET/HEAD, not anonymous permissions.
- `scripts/init-storage.sh` creates `S3_UPLOAD_BUCKET` and `S3_MEDIA_BUCKET`, then sets anonymous access to `none`.
- `apps/api/prisma/schema.prisma` already contains `VideoUpload`, upload status/mode enums and `MediaAsset`.
