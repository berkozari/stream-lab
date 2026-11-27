# STREAM-009.5 — Logging, Metrics & Monitoring

## Current implementation

| Area                | Existing behavior                                                                          | STREAM-009.5 change                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| API correlation     | `requestIdMiddleware` ran after `pino-http`                                                | Assign server-generated request ID before the logger, align Pino `req.id` and `X-Request-Id`                                          |
| API privacy         | HTTP request serializers drop all URL query strings; auth headers and cookies are redacted | Preserved; do not log playback capability queries or error bodies                                                                     |
| API health          | `/api/v1/health` liveness, `/api/v1/health/ready` PostgreSQL/Redis readiness               | Preserved, no metrics endpoint                                                                                                        |
| Worker events       | Unstructured console output                                                                | Pino JSON events, bounded metadata, no raw job data/errors                                                                            |
| BullMQ queue health | Operational queue inspection only                                                          | Log BullMQ v6 waiting, active, delayed and failed counts, plus the separate boolean `paused` queue flag, once per configured interval |
| Worker shutdown     | SIGINT/SIGTERM abort FFmpeg, drain Worker and disconnect resources                         | Stop polling and close read-only metrics Queue before disconnecting Redis                                                             |

## Security decisions

- Request IDs are generated on the API; caller-supplied `X-Request-Id` is never trusted or reused.
- No unauthenticated or authenticated `/metrics` endpoint is introduced. Queue counts are for operators through worker logs only.
- Queue poll reads four BullMQ v6 job counts via `getJobCounts()` and the queue's boolean pause status via `isPaused()`; it never reads job bodies, subject IDs, access tokens, video links or job return values. BullMQ v6 no longer accepts `paused` as a job count state; paused jobs are included in `waiting`.
- Worker error logs include a whitelisted `errorClass` rather than unbounded `error.message`: object store/FFmpeg errors may contain signed URLs.
- The JSON logger has additional Pino redaction for common credential field names. Never dump arbitrary objects into logs.
- Metrics errors **must not affect video processing**. Metrics are observability, not readiness gating or security controls.

## Settings

- `WORKER_LOG_LEVEL` (optional) takes priority over `LOG_LEVEL`; values: `fatal,error,warn,info,debug,trace,silent`.
- `WORKER_METRICS_INTERVAL_MS` optional, integer 1–600000, defaults 60000. Do not run at low intervals on production queues; recommend >=60000.
- No database migration and no Redis data structure migrations.
- One additional `Queue` object is created per Worker process using the already-configured Redis connection. One poll at a time, after an initial delay; timers are unref'd.

## Monitoring runbook

Suggested dashboard/log filtering:

1. API: HTTP 5xx count, p95 response duration (pino-http responseTime), readiness failures by dependency.
2. Worker: `job_failed`, `worker_error`, `queue_metrics_error`, and worker start/stop event rates.
3. Queue: waiting and delayed jobs trend, active worker count, sustained failed count growth. Alert on **sustained deviations from your measured baseline**, not on one snapshot.
4. Recovery: Cross-reference existing API transcoding outbox/recovery logs and worker job events. A successful BullMQ event is not equivalent to a successful READY database publish unless the lifecycle completed.

Production deployment still needs a log collector, retention/privacy policy, alert routing, SLO thresholds, and runbook ownership. The source-level tests do not verify actual ingest to a third-party monitoring service.

## Validation and rollout

1. Run static/TypeScript tests and prior lifecycle/shutdown tests.
2. Test with staging Redis and synthetic jobs, observe at least two metrics samples and worker restart/shutdown. Check safe logging of failed jobs.
3. Verify real request ID correlation and that query/cookie/authorization values are absent from collected logs.
4. Roll out a single worker then scale replicas; each replica logs the **global** queue counts, so dashboard aggregators must not sum queue counts across workers.
5. Rollback: revert code/package/lockfile changes; no DB or Redis schema migration is involved.

### Limitations

- Periodic BullMQ counts measure **queue depth**, not job durations, end-to-end throughput, or transcoding CPU/disk saturation.
- API `/ready` probes Redis and PostgreSQL, but worker readiness is still tied to BullMQ startup rather than a dedicated worker health endpoint.
- Real production log shipping, sampling, high-cardinality label control and notifications are out of scope for this patch.
