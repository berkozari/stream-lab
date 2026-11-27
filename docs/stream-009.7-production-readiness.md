# STREAM-009.7 — Production Readiness & Configuration

## Scope and status

This is an **optional deployment reference and operational gate**, not evidence of a successful production deployment. The package adds a container build reference, application-only Compose template, redacted fail-closed environment preflight, local API readiness healthcheck, and a read-only PostgreSQL backup tool. No production host is touched, no DB migration runs on installation, no secrets are copied, and no public ports are exposed by the Compose template.

Based on the STREAM-009.1 repository and patches through STREAM-009.6. The templates must be validated against the actual target platform before release. 009.7 does **not** configure DNS, TLS certificates, CDN, a managed database, Redis/S3 provisioning, on-call paging, managed log collection, or periodic backup scheduling. The environment's actual security, capacity, and recovery behavior remain operator responsibilities.

## Build layout

- `deploy/Dockerfile`: `api`, `worker`, `migrate` (one-shot), and `web` static Nginx build targets. Node 24, pnpm 10.34.9. Worker includes FFmpeg/FFprobe. API and worker execute as `node`, with read-only root filesystems in Compose. Images still include build-time development packages and CLI tools to preserve Prisma compatibility; minimize them after staging verification, not before.
- `.dockerignore`: excludes `.env` and `.env.*` (including `.env.production`), `.git`, host dependencies, builds, local artifacts.
- `deploy/compose.production.yml`: starts **only application** services. No bundled postgres, redis, or storage. API and web ports are bound to 127.0.0.1. Worker has no port. `migrate` is behind an explicit profile and does not run on `up`.
- `deploy/nginx-web.conf`: static SPA serving only. It does not proxy `/api` or terminate HTTPS.
- API healthcheck queries `/api/v1/health/ready`, which checks PostgreSQL and Redis; `/api/v1/health` is liveness and intentionally not enough to determine readiness.

Use separate external managed PostgreSQL, authenticated **TLS Redis (`rediss://`)**, and HTTPS S3 endpoints. Restrict network access and credentials by service and ensure backups cover database and object storage. Only the dedicated migration role should receive schema DDL privileges in stricter deployments; the provided single env file is a starter reference, not least-privilege role separation.

## First-time staging procedure

1. **Review scope, dependencies and migration plan.** Run existing `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build`, 009.6 offline regressions, and check that the **GitHub CI jobs** (`quality`, `security-regression`, `analytics-postgres`) are actually green. A successful read-only health latency probe is not equivalent to CI, integration, FFmpeg, or production readiness.
2. Copy `deploy/production.env.example` to root `.env.production` **on the target host** (ignored by git). Set mode `0600`; supply values from a secret manager rather than committing them. `NODE_ENV=production`, `RATE_LIMIT_STORE=redis`, TLS-authenticated `REDIS_URL`, explicit `DATABASE_URL`, four distinct >=32-byte secrets, HTTPS S3 and playback origins, HTTPS CORS origins, and independent S3 upload/media buckets are mandatory for this template. IAM/identity-based S3 credentials are allowed; otherwise set both key ID and secret. Use a dedicated production auth secret generator, not local `.env` values.
3. Define trusted proxy addresses with `TRUST_PROXY_CIDRS` based on the **observed source address** of your reverse proxy, not `0.0.0.0/0`. Your TLS ingress must **remove untrusted X-Forwarded-For headers** and replace them with a validated client address before forwarding. An incorrectly trusted proxy can make rate limiting ineffective. Confirm this behavior in staging with real ingress, not only test fixtures.
4. Build and inspect images from repository root. **This is not a release until the built images pass staging validation.**

   ```bash
   docker compose --env-file .env.production -f deploy/compose.production.yml build api worker web migrate
   docker compose --env-file .env.production -f deploy/compose.production.yml config --quiet
   ```

   The last command validates Compose syntax but does not establish network reachability, TLS, compatibility, or security. Docker is required on the target host. Beware: `docker compose config` **without** `--quiet` may reveal expanded secrets.

5. Run a production preflight **inside the built migration image without applying any migration**. The Compose job environment is injected by Docker; secret values are not echoed by the preflight. Do not print the full Compose configuration or run `env`/`set -x` in a production shell.

   ```bash
   docker compose --env-file .env.production -f deploy/compose.production.yml --profile migration run --rm --no-deps --entrypoint node migrate scripts/production/preflight.mjs
   ```

   A successful preflight checks shape, strength and separation of configuration inputs, not the live reachability of any service.

6. **Take and verify a database backup before applying migrations.** On a trusted machine with `pg_dump` and `pg_restore` (matching server major versions), set `DATABASE_URL` and `BACKUP_DIR` via a secret manager, then execute `bash scripts/production/postgres-backup.sh`. `pg_dump` is read-only but the output contains personal data; encrypt off-host, restrict access, and define expiration. Backups are not scheduled automatically. Check the `.sha256` companion file and run an independent restore rehearsal to a disposable database; listing the archive is not a restore test.
7. **Run DB migrations explicitly, while the current release remains healthy.** Migrate only after assessing old/new version compatibility, lock/timeout impact and a real rollback decision:

   ```bash
   docker compose --env-file .env.production -f deploy/compose.production.yml --profile migration run --rm migrate
   ```

   There is no automatic rollback of data migrations. STREAM-009.4 adds `VideoAnalyticsArchive` and an index; confirm that its PostgreSQL integration/rollback smoke is green on an isolated database **before** executing it on staging. `pnpm db:migrate:status` reports state but does not guarantee safe deploy under production workload.

8. Start services and verify readiness + basic user flows:

   ```bash
   docker compose --env-file .env.production -f deploy/compose.production.yml up -d api worker web
   curl --fail --silent http://127.0.0.1:4000/api/v1/health/ready
   curl --fail --silent http://127.0.0.1:8080/
   ```

   API readiness requires live DB and Redis. The worker has no HTTP readiness probe: verify structured startup/queue-metrics events, one benign transcoding attempt, FFmpeg scratch capacity and shutdown under a controlled staging load. Verify cookie `Secure` flags, owner isolation, upload signed URLs, playback, and creator analytics. This reference does not deploy a TLS terminator or set a public domain.

9. Configure an external TLS reverse proxy so **same-origin** `/api/` routes to the loopback API and `/` routes to the loopback web service. Preserve `Host`, sanitize trusted proxy headers, serve valid HTTPS certificates, and validate signed HLS/S3 media access from browsers. If hosting `apps/web/dist` elsewhere, keep Vite's default `/api/v1` base path or supply a correctly configured `VITE_API_BASE_URL` at **build time**. CSP, HSTS, WAF/CDN, and TLS renewal must be reviewed at the edge.
10. Before promoting, verify GitHub protection rules, artifact provenance/pinning, image vulnerability scans, monitoring alerts, periodic encrypted DB/S3 backups, restore rehearsals, worker scratch usage, retention job operating policy, and a deployment rollback drill. Record versions/digests, migration applied, operator, and staging acceptance results.

## Safe rollback and incident procedure

- **API/web/worker code rollback:** stop traffic, drain active jobs (SIGTERM follows current worker cancellation logic), deploy the previous **known-good image digests**, verify readiness and authentication/playback. Keep FFmpeg scratch volume under review. Avoid two deployments consuming an incompatible queue schema.
- **Database rollback:** Prisma `migrate deploy` does not automatically reverse migrations. Do not automatically drop an archive table or replay schema history. Prefer forward-fixing additive migrations. If data restoration is required, follow the documented incident process with a **tested encrypted backup** and an approved maintenance window; a full restore would overwrite later writes. Reconcile S3 objects and BullMQ jobs separately.
- **Restore rehearsal (isolated only):** create a brand-new disposable PostgreSQL database, confirm identity/hostname, compare backup checksum, then run `PGDATABASE="$RESTORE_TEST_DATABASE_URL" pg_restore --no-owner --no-acl backup.dump` **only against that disposable database**. Keeping the connection URI in `PGDATABASE` instead of a CLI argument reduces exposure in process listings. Follow your platform secret-handling policy. Never paste a production credential into a terminal command line. Validate row counts, migration state, and API behavior after the rehearsal. Do not restore to production without an explicit human-approved disaster recovery plan.
- **Analytics retention:** retention defaults to dry-run. Manual destructive execution requires separate acknowledgement and a bounded batch. Do not automatically schedule purge until the archive-aware dashboard integration is proven with a real PostgreSQL service.

## Testing and acceptance

- `node --test scripts/tests/production-preflight.test.mjs scripts/tests/verify-stream-009-7.test.mjs`
- `node scripts/verify-stream-009-7.mjs` (8/8 static evidence checks)
- `bash -n scripts/production/postgres-backup.sh`
- `pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` (in your installed workspace)
- Docker `build`, `compose config --quiet`, health/readiness and worker staging smoke (Docker must be available)
- GitHub CI remains a **separate real-run requirement**. The local performance baseline from 009.6 was 40 GETs / zero errors / p95 1.8ms, limited to localhost `/api/v1/health` and not a production performance SLA.

A static 8/8 PASS confirms source evidence only; it cannot confirm build success, TLS behavior, remote dependencies, backups/restores, or a production rollout. STREAM-009.8 should not be closed until those are addressed or explicitly documented as out of scope for a portfolio-only demonstration.
