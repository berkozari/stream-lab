# STREAM-009 — Final Regression & Milestone Closure (009.8)

**Scope:** Engineering milestone completion and evidence-based release review, not an approval to deploy production. **No automatic deployment, live migration, analytics purge, browser write test or Git merge** is part of this package.

## Completed engineering scope

| Stage | Implemented scope                                                                      | Known evidence / remaining limitation                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 009.1 | Security, performance, observability inventory                                         | 8/8 static checks were reported PASS.                                                                                                                                         |
| 009.2 | Central Redis rate limits, bounded proxy trust, blank example secrets                  | 8/8 static checks and subsequent regression fixes reported successful; operational Redis failover needs staging exercise.                                                     |
| 009.3 | Worker admission budgets, FFmpeg time/thread limits, disk checks                       | Regression tests reported successful; representative transcoding load and disk-pressure failover need staging exercise.                                                       |
| 009.4 | Analytics retention archive, atomic purge, all-time rollups                            | 8/8 static checks PASS. **Live PostgreSQL migration and rollback integration has not been confirmed**; destructive retention writes have not been approved.                   |
| 009.5 | API request correlation, structured worker logs, queue snapshots                       | User reported successful tests; confirm centralized log transport and alert delivery separately.                                                                              |
| 009.6 | Offline regression orchestration, bounded local health timing, CI jobs                 | Local health probe: **40/40 GET, 0 errors, p50 0.4 ms, p95 1.8 ms**. This was a loopback health sample, **not a load test**. Actual GitHub CI job outcomes are not confirmed. |
| 009.7 | API/worker/web/migration images, production Compose, config preflight, backup guidance | 8/8 source checks PASS. Real Docker image builds, staging rollout and recovery exercise not confirmed.                                                                        |
| 009.8 | Final read-only source/Git audit and orchestrated offline regression                   | Verify on the actual feature branch; do not claim PASS before execution.                                                                                                      |

## Run final milestone gates

1. Review working tree and branch. Never add `.env`, real credentials or browser auth state to Git.

   ```bash
   git status --short
   git diff --check
   git diff --cached --check
   git diff --cached --stat
   ```

2. Preview without running tests or touching Git:

   ```bash
   node scripts/verify-stream-009-8.mjs --plan
   ```

3. Read-only source/Git inspection (default is the same as `--inspect-only`):

   ```bash
   node scripts/verify-stream-009-8.mjs --inspect-only
   ```

4. Run all previously shipped static verifiers and existing API/worker/analytics offline test gates. **This may build local artifacts but does not intentionally access live PostgreSQL/Redis, deploy, run browser E2E, or purge analytics:**

   ```bash
   node scripts/verify-stream-009-8.mjs --offline
   ```

5. Compare observed outputs against actual gate names. A successful `--offline` result means local static and fixture gates passed **on that checkout**. It does not validate a live infrastructure setup.

## External release and acceptance gates — not automatically executed

The following must be evidenced before any claim of _production readiness_ or production approval. Record evidence links, timestamps, reviewer, and environment; never store passwords, connection strings or private key material in this document.

| Gate                     | Minimum acceptance                                                                                                                                                                            | Status until proven otherwise     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| GitHub CI                | On the intended commit/PR, **quality**, **security-regression**, **analytics-postgres** all PASS; review action version resolution and CI logs                                                | **UNVERIFIED**                    |
| Disposable PostgreSQL    | Apply migrations in isolated DB; run `ANALYTICS_INTEGRATION_ACK=disposable-database pnpm --filter @streamlab/api smoke:analytics:retention`; confirm transaction rollback and all-time rollup | **UNVERIFIED**                    |
| Migration readiness      | On approved staging, `pnpm --filter @streamlab/api db:migrate:status` and an approved migration plan; backup and restore path verified before deployment                                      | **UNVERIFIED**                    |
| Docker                   | All API, worker, migrate, web image targets build; production Compose `config --quiet`; no real secrets in image; containers start and API readiness passes                                   | **UNVERIFIED**                    |
| Real dependency behavior | Staging PostgreSQL/Redis/S3, bounded proxy trust, rate-limit fail-closed, worker queue recovery, disk pressure, graceful SIGTERM                                                              | **UNVERIFIED**                    |
| Observability            | Request IDs correlate, worker logs reach collector, metrics alert rules tested including Redis outage                                                                                         | **UNVERIFIED**                    |
| TLS ingress              | TLS certificates, secure cookies, CORS/host restrictions, proxy routes, origin settings and signed HLS playback reviewed                                                                      | **UNVERIFIED**                    |
| Backup / restore         | Encrypted durable backup plus **restore rehearsal** on isolated database, storage recovery plan, rollback runbook                                                                             | **UNVERIFIED**                    |
| Browser / end-to-end     | Read-only Playwright recheck on staging; any write test requires separate deliberate opt-in and disposable video                                                                              | **UNVERIFIED for this milestone** |
| Performance              | Staging representative latency/throughput/error rates including concurrent transcoding; define explicit SLOs                                                                                  | **UNVERIFIED**                    |
| Release approval         | Reviewed PR/staged diff, migration approval, approved credentials and release operator go/no-go                                                                                               | **NOT GRANTED**                   |

**PostgreSQL caution:** analytics retention has an additive schema migration. Never run `db:migrate:deploy`, `analytics:retention` with write acknowledgments, or `pg_restore` against production as part of the final offline check. Migration, data retention, and restores must be approved separately by an operator and executed in a supported order. These are live operational actions, not closure script options.

**Docker caution:** Never use an unreviewed production `.env` on a developer machine. The production Compose template references external dependencies and binds public-facing services to localhost; actual HTTPS / reverse proxy wiring still requires staging confirmation.

## PR and merge decision

- Confirm the intended feature branch (for example `feature/stream-009-production-hardening`) is rebased or merged with `main` as per repository policy, and its CI is green.
- Review all changed files and staged diff, particularly GitHub workflow permissions, deployment Dockerfiles, Prisma migrations, `.env.example`, log redaction and data-retention policies.
- Attach the output of `node scripts/verify-stream-009-8.mjs --offline`; include independent CI and staging acceptance evidence or explicitly mark their deferral.
- **Engineering milestone can be merged as code-complete without production certification**, provided any deferred gates are transparently recorded and merge/release criteria are respected. Do not equate merge with release approval.
- Rollback plan: revert application deployment to the last known compatible image as needed; do not automatically roll back additive migrations or delete archived analytics data. Restore requires a separately tested database recovery procedure and explicit approval.

## Deferred follow-up

Any unverified external release gates remain open operational work. Only after their results are recorded and release approval given may the system be described as validated for production. Completion of the STREAM-009 code milestone itself is independent of an actual production deployment.
