# STREAM-001.4 — Local Infrastructure

## Scope

Three infrastructure containers: PostgreSQL, Redis, and S3-compatible object storage.
React (`apps/web`), Express (`apps/api`), and the video worker (`apps/worker`) continue running on the host using `pnpm dev`.
No Prisma migration, BullMQ connection, FFmpeg job, or real upload is implemented in this task.

## Why SILO instead of the original MinIO image?

The original MinIO community repository was archived in April 2026, and its historical container image distribution became unreliable. We therefore use **PGSTY SILO**, a maintained MinIO fork, for local S3-compatible development. The S3 API abstraction and the planned AWS SDK integration remain unchanged. We pin an explicit SILO server release instead of `latest`.

- S3 endpoint: `http://127.0.0.1:9000` (host), `http://storage:9000` (future Dockerized apps).
- Web console: <http://127.0.0.1:9001>.
- Default host ports are configurable with `POSTGRES_PORT`, `REDIS_PORT`, `S3_PORT`, and `S3_CONSOLE_PORT` in root `.env`.
- PostgreSQL and Redis use official major-versioned image tags, with explicit healthchecks and named volumes.

## Start from the repository root

```bash
cp .env.example .env
# Review the sample local-only credentials before running.
docker compose config --quiet
bash scripts/infra-up.sh
bash scripts/smoke-infra.sh
```

`infra-up.sh` starts services, waits for healthchecks, creates two private buckets if needed, and applies per-bucket CORS rules. `smoke-infra.sh` checks PostgreSQL SQL, Redis PING, S3 readiness, both buckets, and CORS.

**macOS note:** Use Docker Desktop with Docker Compose v2. If any host port is already occupied by another project, change only the corresponding `*_PORT` variable in root `.env`.

## Development endpoints and credentials

| Service    | Host URL / port         | Notes                                                      |
| ---------- | ----------------------- | ---------------------------------------------------------- |
| PostgreSQL | `127.0.0.1:5432`        | `POSTGRES_*` from root `.env`                              |
| Redis      | `127.0.0.1:6379`        | No password; bound to loopback, **local development only** |
| S3 API     | `http://127.0.0.1:9000` | Root credentials from `S3_ROOT_*`                          |
| S3 console | `http://127.0.0.1:9001` | Same local credentials                                     |

The `storage` container listens on **9000** internally regardless of `S3_PORT` on the host. When APIs run locally, use the **host-mapped** port. When they run in the Compose network later, use `storage:9000`.

## Buckets

- `streamlab-uploads`: original uploaded files, not public.
- `streamlab-media`: processed HLS manifests, segments, and thumbnails, not public.

Bucket names come from root `.env`. CORS permits the local Vite origin (`localhost:5173` or `127.0.0.1:5173`): `PUT`, `GET`, `HEAD` on uploads; `GET`, `HEAD` on media. Anonymous access stays **disabled**; CORS is a browser permission policy, not storage authentication. Upload presigned URLs and playback authorization arrive in STREAM-004 and STREAM-006.

`infra/storage/cors/` XML files are bind-mounted read-only to the storage container. If you change those files, rerun `bash scripts/init-storage.sh` and then `bash scripts/smoke-infra.sh`.

## Environment mapping for future application tasks

This task configures **infrastructure only**. In STREAM-001.5–001.8, we will connect the existing API and worker to these services. Example future settings **for applications running on the host**:

```dotenv
DATABASE_URL=postgresql://streamlab:streamlab_dev_password_change_me@127.0.0.1:5432/streamlab
REDIS_URL=redis://127.0.0.1:6379
S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
S3_BUCKET_UPLOADS=streamlab-uploads
S3_BUCKET_MEDIA=streamlab-media
```

These values assume default ports and the **example** credentials. Do not expose root credentials to the browser, and do not use root credentials as application credentials in production. A least-privilege application identity will be designed when storage integration is added.

## Lifecycle and troubleshooting

```bash
docker compose ps
docker compose logs -f postgres redis storage
bash scripts/init-storage.sh
bash scripts/smoke-infra.sh

docker compose down
# `down` preserves all named volumes.
# DESTRUCTIVE — only run if you intend to erase local PostgreSQL, Redis, and S3 data:
docker compose down -v
```

- `port is already allocated`: change port mapping in root `.env`, then restart Compose.
- `storage unhealthy`: check `docker compose logs storage` and root credentials; check that the pinned SILO image is available for your architecture.
- `mcli` errors: `docker compose exec -T storage mcli --version`; rerun initialization after the storage healthcheck passes.
- `invalid credentials` after changing `.env`: note that persisted server data may contain previous configuration. Diagnose before removing volumes; **do not** reset data casually.
- `docker compose config` fails: verify root `.env` exists and has the required variables.

## Security and portability

- All published ports bind to `127.0.0.1`, not `0.0.0.0`.
- The root `.env` is ignored by Git; `.env.example` is committed.
- The root user/password pairs are **development examples only**.
- Data survives `docker compose down` through named volumes.
- Container images are pinned to major lines or explicit SILO release, but production images should be further locked to verified digests.
- Storage is provider-agnostic at the application layer: AWS S3 or another maintained S3-compatible implementation may be used later.

## Sources

- Docker Compose startup/health: <https://docs.docker.com/compose/how-tos/startup-order/>
- PostgreSQL official image storage: <https://hub.docker.com/_/postgres>
- Redis Docker and AOF: <https://redis.io/tutorials/operate/orchestration/docker/>
- SILO maintained image and healthcheck: <https://silo.pgsty.com/download/>
- SILO compatibility and version matrix: <https://silo.pgsty.com/compatibility/versions/>
