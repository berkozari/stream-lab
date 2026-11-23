# STREAM-001.8 — Worker Foundation

## Purpose

A real BullMQ **API-side producer** and a separate **Node.js worker consumer** now share a typed queue contract through `@streamlab/contracts`. This milestone uses a dummy smoke job; **no FFmpeg, storage, or database mutations happen yet**. The API-side producer runs from a CLI script (`apps/api/scripts/queue-smoke.ts`), rather than exposing a public unauthenticated queue endpoint.

## Components

- `packages/contracts/src/queue.ts` — canonical queue name and typed smoke payload/result.
- `apps/api/src/lib/video-processing-queue.ts` — lazy producer connection and queue client.
- `apps/api/scripts/queue-smoke.ts` — enqueue, poll for completion, validate result.
- `apps/worker/src/jobs/video-processing.worker.ts` — Redis connection, BullMQ Worker, error logging, graceful shutdown.
- `apps/worker/src/processors/smoke.processor.ts` — stand-in processing with payload validation and optional simulated retry.
- `apps/worker/tests/unit/smoke.processor.test.ts` — processor unit tests without Redis.

## Local setup

From repo root (Node.js 24 and pnpm configured):

```bash
pnpm install
pnpm --filter @streamlab/contracts build
pnpm verify:worker:foundation
pnpm test:worker:foundation
```

Start PostgreSQL/Redis/storage via `docker compose up -d` or `bash scripts/infra-up.sh`. For queue operations only Redis is required.

In terminal **A**:

```bash
pnpm dev:worker
```

In terminal **B**, from the repo root:

```bash
pnpm smoke:queue
QUEUE_SMOKE_RETRY=1 pnpm smoke:queue
```

Expected completion contains `PASS: API producer -> Redis/BullMQ -> worker -> completed` and displays a worker PID. Retry mode deliberately fails the **first attempt only** and then succeeds. A worker must be running before issuing the smoke command; the smoke CLI fails after 25 seconds otherwise.

Root `.env` is read both by the API and worker, with existing environment variables taking precedence. Optional entries:

```dotenv
REDIS_URL=redis://127.0.0.1:6379
WORKER_CONCURRENCY=1
```

When `REDIS_URL` is absent, `REDIS_PORT` is used (default 6379).

## Queue behavior

- Producer connection uses short retry limits and `enableOfflineQueue: false` so an API caller does not hang indefinitely.
- Worker uses `maxRetriesPerRequest: null` for long-running consumers, per BullMQ documentation.
- Job IDs are unique `smoke-<uuid>` strings, and terminal history is limited by `removeOnComplete` and `removeOnFail` retention.
- `attempts: 3` with a short fixed backoff demonstrates retries. This does not prove general exactly-once processing.
- Shutdown signals call `worker.close()` to wait for the current job, then close Redis; a watchdog prevents unbounded shutdown waits.
- For reliability, keep Redis `maxmemory-policy` at `noeviction`; check it with `docker compose exec redis redis-cli CONFIG GET maxmemory-policy`.

## Future implementation

`STREAM-005` will add FFprobe, FFmpeg, video metadata lookup, idempotency/version checks, failure recovery and a persistent outbox/reconciliation strategy. No domain processing job should be enqueued before that contract is implemented. The smoke processor intentionally rejects unsupported job names.

## Verification and known limitations

`pnpm verify:worker:foundation` only checks file/manifest presence. `pnpm test:worker:foundation` unit-tests the processor. `pnpm check` validates the whole workspace. `pnpm smoke:queue` proves the actual Redis/Worker flow; it cannot run without Redis and a live worker.
