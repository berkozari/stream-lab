# STREAM-005.6D — Real failure recovery verification

This suite exercises the **actual PostgreSQL repository and Redis/BullMQ** with
isolated fixtures. It does **not** run the StreamLab production worker, change
shared queue keys, stop Redis, delete MinIO objects, or generate HLS media.

## Safety gates

- A **disposable, migrated** PostgreSQL database with a name ending in `_test`
  (e.g. `streamlab_test`) must be selected using `DATABASE_URL`.
- Explicitly set `STREAMLAB_TEST_DB=1` and `STREAMLAB_TEST_REDIS=1`.
- Never run with `NODE_ENV=production`.
- The suite creates its own `sl-0056d-<uuid>` BullMQ queues, removes only those
  queues, and deletes only the DB records it created.
- The Redis-outage case is **injected at the Redis lookup boundary**, without
  stopping any shared services. The waiting and failed job cases use real Redis.

## Run

From the repository root, after provisioning/migrating the **test** database:

```bash
STREAMLAB_TEST_DB=1 STREAMLAB_TEST_REDIS=1 \
  pnpm --filter @streamlab/api test:transcoding:failure:live
```

Ensure `DATABASE_URL` in the test process targets the disposable `*_test`
database, **not** the application database. `REDIS_URL` (or `REDIS_PORT`)
should point to a local development Redis instance; queue names are unique.
No FFmpeg installation is required for this suite.

## What is verified

1. Redis returns `unknown` after a worker loses its job: an expired DB lease is
   atomically converted to `QUEUED` and its outbox row to `PENDING`, preserving
   `processingVersion` and the deterministic job ID.
2. Real BullMQ `waiting` job remains unchanged; adding the same stable job ID
   twice does not create another waiting job.
3. A real BullMQ worker intentionally fails a test job. Terminal state `failed`
   is reconciled to DB `FAILED`, with the safe outbox error code.
4. A real BullMQ `completed` job without a matching `READY` DB transaction is
   marked terminal (`JOB_COMPLETED_WITHOUT_READY`).
5. A DB lease renewal racing the Redis lookup prevents recovery through CAS.
6. A simulated Redis lookup outage leaves the DB lease, video and outbox intact.

## Not covered by this automated suite

- A `SIGKILL` during a large, real FFmpeg encode and recovery after BullMQ lock
  expiration (requires separate manual testing with a long video).
- A physical Redis/MinIO outage, HLS partially written to object storage, and
  orphan-object deletion (review the `cleanup:hls:dry-run` report first).
- Multiple simultaneous real workers in a containerized deployment.

Do not stop a shared Redis/PostgreSQL/MinIO container or run storage deletion
commands as part of these tests. A dedicated environment is required for those
fault-injection experiments.
