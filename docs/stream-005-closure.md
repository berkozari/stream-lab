# STREAM-005 — Final regression and milestone closure

This checklist validates the implemented transcoding pipeline before merging
`feature/stream-005-transcoding-pipeline`. It is **not** a claim that tests already ran.

## 1. Preconditions

- Use the feature branch and review `git status` / `git diff --check`.
- Confirm the `pnpm-lock.yaml` reflects the current workspace manifests;
  run `pnpm install --frozen-lockfile` to verify consistency.
- FFmpeg and FFprobe must be available to **both** the E2E process and worker.
  `FFMPEG_PATH` / `FFPROBE_PATH` can point to trusted absolute executable paths.
- Run the API dispatcher and worker with the same PostgreSQL, Redis and MinIO
  configuration when performing E2E tests. Keep only the intended worker active.

## 2. Offline gates (no live database or Redis mutations)

From the monorepo root:

```bash
pnpm install --frozen-lockfile
pnpm verify:stream:005
git diff --check
```

The verification command runs the contracts, API queue/outbox/recovery and upload
regressions, worker lifecycle/probe/HLS/shutdown/cleanup tests, FFmpeg integration,
and workspace lint, typecheck, build and formatting checks. It reports **all**
failed gates instead of stopping at the first. It does not run the live fault
injection or S3/MinIO E2E tests.

## 3. Live recovery gate — isolated TEST database only

The live test creates and mutates rows and disposable BullMQ queues. Use a
**dedicated** database whose name ends with `_test`; do not run this against
ordinary development, staging or production data. After ensuring its migrations
are deployed, run with the explicitly configured test `DATABASE_URL`:

```bash
DATABASE_URL="$TEST_DATABASE_URL" STREAMLAB_TEST_DB=1 STREAMLAB_TEST_REDIS=1 \
  pnpm --filter @streamlab/api test:transcoding:failure:live
```

Do not infer `DATABASE_URL` from the app's `.env`: StreamLab can construct its
connection from `POSTGRES_*` variables, so check the actual test URL/DB first.
The test refuses database names that do not end with `_test`.

## 4. Real pipeline gates — local development only

Use the normal **development** database, not the fault-injection test URL.
Run PostgreSQL, Redis and MinIO; start `pnpm dev:api` and `pnpm dev:worker` in
separate terminals, then execute in a third:

```bash
STREAMLAB_E2E_TRANSCODING=1 pnpm --filter @streamlab/api smoke:transcoding:e2e
STREAMLAB_E2E_TRANSCODING=1 STREAMLAB_E2E_ABR=1 \
  pnpm --filter @streamlab/api smoke:transcoding:e2e
```

The baseline probe uses a 320×240 source and requires **1** HLS rendition.
The optional ABR probe uses 1280×720 and requires **4** renditions (240p, 360p,
480p, 720p) without upscaling. It validates the master entries, each variant's
complete playlist and existence of the referenced transport stream objects in
MinIO. A failure preserves the test records for debugging; inspect and clean up
them deliberately rather than blindly resetting the database or bucket.

A passing baseline alone is **not** evidence that multirendition playback works.

## 5. Reliability and safety review before merge

- Confirm orphan cleanup was reviewed with `cleanup:hls:dry-run`. Do **not** run
  `cleanup:hls:execute` as part of this checklist; destructive cleanup is a
  separate, expressly reviewed operation.
- Review worker shutdown tests and recovery logs; the 005.6D suite simulates
  a Redis lookup outage and terminal jobs, but does **not** physically kill
  a worker process or stop a shared Redis/MinIO instance. Document these
  remaining chaos scenarios as follow-up acceptance tests if not separately
  executed in a disposable environment.
- Ensure FFmpeg and FFprobe binaries are present in the deployment worker
  image/environment (the API generally does not need them).
- Review `git diff --check`, `git status` and the entire diff; exclude `.env`,
  credentials, test media, logs and generated build output.

## 6. Merge gate

Mark STREAM-005 complete only after offline tests, isolated live recovery tests,
**both** E2E modes, and the safety review pass. Then commit your changes on the
feature branch and open a PR. The next milestone is STREAM-006 — HLS playback,
including protected media delivery and hls.js quality selection.
