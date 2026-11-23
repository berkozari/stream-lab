# ADR-003 — Direct-to-object-storage uploads

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

Uploading multi-GB videos through Express wastes network bandwidth and application resources; public access to the original file is unacceptable.

## Decision

- Store original videos in a private S3-compatible object store (MinIO locally, S3-compatible production provider).
- The authenticated API validates intent, allowed extensions/MIME declarations, size quota, ownership, and creates `Video`/`VideoUpload` records.
- API generates short-lived presigned upload URLs scoped to a unique, server-generated key such as `originals/<videoId>/<uploadId>/source`.
- Browser sends bytes directly to object storage and reports completion to API.
- API verifies object existence/size and, when provided, server-confirmed checksums **before** marking upload verified / enqueuing media processing. MIME provided by the browser is untrusted; FFprobe validates actual media structure in worker.
- Set CORS only for permitted web origin/methods/headers. Do not leak storage credentials to frontend.
- Multipart upload and cleanup of abandoned multipart sessions will be included when file-size requirements justify them (STREAM-004).
- For retries, use a new unique upload key; no overwriting an accepted original.

## Consequences

Good bandwidth scaling and limited API resource usage, with extra lifecycle management for incomplete uploads. Presigned URLs can be reused before expiration and can overwrite their designated object; key uniqueness, brief TTL and post-upload validation mitigate this.

## Non-goals

StreamLab API is not a generic file upload proxy. No trust in client-reported completion.

## Verification

Invalid upload requests are rejected, uploaded object is verified before queueing, expired upload is not accepted, and creator cannot upload to someone else's Video.

## Reference

https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html
