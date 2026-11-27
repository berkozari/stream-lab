# STREAM-009.3 — Upload, Transcoding & Worker Reliability

## Scope and compatibility

Hardens the existing S3-original → local download → FFprobe → FFmpeg → attempt-scoped HLS upload → token-fenced PostgreSQL READY transition. It **does not replace** the PostgreSQL outbox, BullMQ retries, active lease heartbeat, shutdown handoff, HLS cleanup, session/auth/upload API endpoints or media migration logic. No dependency change or Prisma migration. Work is performed on the `streamlab-STREAM-009.1-source.zip` baseline plus the 009.2 hardening patch in the previous task; reconcile a newer branch diff before applying.

## Controls

1. **Scratch before download.** Check free blocks on the operating system temporary filesystem (`os.tmpdir()` via `statfs`) before downloading the verified original. Require `source.sizeBytes + TRANSCODE_MIN_SCRATCH_FREE_BYTES`. The existing streamed byte-size verification and guaranteed temporary cleanup remain intact.
2. **Admission before encoding.** After FFprobe, reject source video over configured duration/pixel limits. Limit projected HLS object count to 20,000 (matching the existing orphan reaper limit) and check conservative predicted encoded output space. Estimate uses twice the sum of rendition bitrate envelopes over the probed duration; this is a _preflight heuristic_, not a disk quota. A size-based capacity race between parallel workers/other processes is still possible; production worker concurrency and disk sizing must be managed operationally.
3. **Permanent vs transient errors.** Invalid media duration/pixels or projected excessive object counts use BullMQ `UnrecoverableError`; existing processor releases the DB lease to FAILED without wasting other attempts. Scratch insufficiency, statfs failure and FFmpeg execution failures are ordinary errors, using existing retries/recovery. Shutdown cancellation and lease-loss fencing are unchanged.
4. **FFmpeg process bounds.** Limit encoder/filter threads and per-profile execution timeout. Existing shell-free executable invocation, AbortSignal and verified HLS outputs remain in place. `-threads` and `-filter_threads` are process controls, **not** an OS-wide CPU or memory sandbox; container CPU/memory quotas are still required before production.
5. **Last-line manifest cap.** Reject more than 20,000 output objects before any S3 PUT. No storage deletion without the existing token-scoped cleanup/reaper rules.

## Configuration and default budgets

The worker reads these variables from the root `.env` (`apps/worker/.env.example` is documentation only):

| Variable                              |             Default |  Allowed range | Notes                                                                                                                                                           |
| ------------------------------------- | ------------------: | -------------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRANSCODE_MAX_DURATION_SECONDS`      |         14400 (4 h) |        1–86400 | An intentional policy change from the previous ffprobe's 24-hour technical ceiling. Longer sources now fail until policy is raised (subject to the object cap). |
| `TRANSCODE_MAX_SOURCE_PIXELS`         |    8294400 (4K UHD) |    4–268435456 | Rejects very large source dimensions; 4K defaults can be raised after staging profiling.                                                                        |
| `TRANSCODE_MIN_SCRATCH_FREE_BYTES`    | 536870912 (512 MiB) | 0–137438953472 | Available filesystem blocks reserved _on top of_ estimated current job space.                                                                                   |
| `TRANSCODE_FFMPEG_THREADS`            |                   2 |           1–16 | FFmpeg encoder/filter pipelines per rendition; encode is sequential.                                                                                            |
| `TRANSCODE_FFMPEG_PROFILE_TIMEOUT_MS` |       7200000 (2 h) |   1000–7200000 | For each rendition, not an entire multi-profile job deadline.                                                                                                   |

Non-integer/out-of-range values throw a clear configuration error at worker startup. Lower scratch reserve is supported only for deliberate local/test use; measure actual FFmpeg temporary file growth before reducing it. The worker's existing `WORKER_CONCURRENCY` is separate (defaults to 1), and replicas share disk or mount limits only if deployed that way.

**Scratch capacity caveat:** The source is downloaded first; before encode, source already occupies disk. The second check therefore uses _encoded output estimate + reserve_. The estimate uses output bitrate and assumes up to a 2× safety envelope. An unexpectedly inefficient encode or concurrent activity may still fill the volume. Monitoring, container filesystem quotas, and production isolation remain STREAM-009.5/009.7 work.

## Safe migration and validation

- **No automatic migration of READY videos.** Existing published HLS outputs and DB state are unaffected. Videos already QUEUED/PROCESSING may fail under newly lowered limits; establish a product limit and communicate it before enabling in production.
- **Stage first.** Use representative landscape/portrait, small/4K, with/without audio videos; collect CPU peak, temp bytes, transcoding duration, retry count, HLS object count and error classifications. Tune duration, scratch and threads for deployment size; manually test an insufficient temp disk, SIGTERM during FFmpeg, lost lease, S3 upload timeout and orphan cleanup `--dry-run`. Do **not** run deletion against production without explicit review.
- **Runtime tests.** `pnpm --filter @streamlab/worker test:hardening` includes injected unit tests; `pnpm --filter @streamlab/worker test:hls:integration` exercises real FFmpeg if installed. Run prior 005.6 recovery and 008.x gates as applicable.
- **Quality.** `pnpm lint && pnpm typecheck && pnpm format:check && pnpm build`, plus `node --test scripts/tests/verify-stream-009-3.test.mjs` and `node scripts/verify-stream-009-3.mjs`.
- **Deployment decision.** These new checks are primarily **admission checks**, not a guarantee of durable capacity reservation or total lifecycle reliability. CI, metrics/alerts, persistent failure thresholds, container quotas, live S3/Redis/PostgreSQL fault injection and backups remain milestones 009.5–009.7.

## Exit criteria

All added unit tests + existing worker lifecycle/shutdown tests pass, static audit 8/8 passes, real FFmpeg smoke runs (or is explicitly reported skipped), lint/typecheck/format/build pass, staging resource caps are understood, and PR diff/migration status are reviewed before merge.
