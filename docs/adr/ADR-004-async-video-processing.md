# ADR-004 — Asynchronous video processing

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

FFmpeg is resource-intensive and can run for minutes. It must not run in API request handlers.

## Decision

- Use Redis + BullMQ for the `video-processing` queue and a separate `apps/worker` process for FFprobe, FFmpeg, thumbnails and upload of HLS assets.
- Job payload: `{ videoId, uploadId, processingVersion }`. It refers to database state; never include secret storage credentials or large content in job data.
- Treat queue delivery as **at least once**. Retry transient errors with bounded exponential backoff. Mark unsupported/corrupt media as terminal failures.
- Enforce idempotency based on `(videoId, processingVersion)` and guarded DB state updates; deterministic BullMQ job IDs help de-duplication but are not the only guarantee, especially after job removal.
- Write outputs to a versioned `media/<videoId>/<processingVersion>/...` prefix; only after outputs are validated update the DB's active media pointer / status to READY. Old versions are cleaned asynchronously.
- API stores a durable processing intent with the upload confirmation. If enqueue fails after DB commit, a reconciliation task must find pending work and enqueue it; full transactional outbox is optional if reconciliation is sufficient for the MVP.
- Limit worker concurrency according to CPU/memory; apply job timeouts/cancellation, process cleanup and graceful shutdown.

## State and failure invariants

- Only verified uploads can be processed.
- `READY` means playable master/variant playlists and required segments exist.
- An old processingVersion may not override newer processing results.
- Retry or worker crash does not publish partial media.
- Terminal failure records a safe error code and gives creator a retry option where appropriate.

## Alternatives

- In-request FFmpeg: rejected due to API latency and resource contention.
- Event-driven microservices/Kafka: rejected due to setup complexity for MVP.

## Verification

Duplicate job and crash/retry simulations do not create conflicting active outputs; Redis downtime after DB commit is recoverable.

## References

https://docs.bullmq.io/patterns/idempotent-jobs
https://docs.bullmq.io/guide/retrying-failing-jobs
