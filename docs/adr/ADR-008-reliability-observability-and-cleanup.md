# ADR-008 — Reliability, observability and cleanup policies

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

Video files and background jobs persist across failures. A successful HTTP response does not guarantee that media is fully processed or storage is cleaned.

## Decision

- All services emit structured logs with `requestId` and, where applicable, `videoId`, `uploadId`, `processingVersion`, `jobId`, duration and safe error code.
- Secrets, access/refresh tokens, presigned URLs and user-uploaded content must not be logged.
- Expose liveness/readiness checks as appropriate; readiness checks cover critical dependencies for a service (excluding optional ones).
- Track queue depth, job failure/retry counts, transcoding duration, upload failures, output file sizes, storage cleanup backlog and API latency. Start with logs and basic metrics; add full distributed tracing only if useful.
- Use state-transition guards, bounded retries/backoff, idempotent cleanup and reconciliation for stuck/incomplete uploads and missing queue jobs.
- Background garbage collection deletes abandoned originals, superseded HLS versions and incomplete multipart uploads according to a retention window. Never remove objects referenced as active before successful pointer switch.
- Video lifecycle state is explicit: DRAFT → UPLOADING → UPLOADED → QUEUED → PROCESSING → READY; failures may enter FAILED and recovery; DELETING is a terminal workflow. Visibility remains independent.
- Do not promise exactly-once queue delivery. Define operational recovery as part of correctness.

## Verification

At least one simulated retry, one enqueue failure, one worker crash, and one interrupted upload have documented recovery behavior before STREAM-006 closure.
