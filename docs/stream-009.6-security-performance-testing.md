# STREAM-009.6 — Security & Performance Testing

## Scope

STREAM-009.6 closes 009-F03 (missing GitHub Actions CI) by introducing CI regression gates with writes isolated to a **disposable PostgreSQL service**. It also bundles existing security and worker regression tests, adds an HTTP boundary test and provides a **local-only, read-only** health latency sampler. It does **not** declare the application production-ready.

No production API/worker code, DB schema, migration, dependencies, or external cloud resources are changed by this package.

## CI gates (pull requests, main pushes and manual runs)

| Job                   | Behavior                                                                                                                                          | Services/side effects                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `quality`             | frozen dependency install, ESLint, TS, Prettier and build                                                                                         | No live DB; placeholder `DATABASE_URL` only needed by Prisma generation                               |
| `security-regression` | JWT/CSRF, multi-instance Redis-store fixture, HLS, analytics replay and retention, worker budgets/shutdown, observability and new HTTP boundaries | HTTP ephemeral local fixtures; mocked Redis; no browser E2E or transcoding job writes                 |
| `analytics-postgres`  | ephemeral PostgreSQL 17 service, migrations and STREAM-009.4 rollback fixture                                                                     | Disposable CI-only DB, fixed dummy password, explicit `ANALYTICS_INTEGRATION_ACK=disposable-database` |

Workflow uses Node 24, pnpm 10.34.9, `--frozen-lockfile`, `contents: read`, no `pull_request_target`, and checkout with `persist-credentials: false`. The CI test DB is created for each runner and discarded afterwards; it must not be wired to staging or production credentials.

**Follow-up:** CI may fail if existing repository tests have undiscovered real network dependencies. Treat a GitHub green run as the actual evidence, not a static audit pass.

## Local commands

From the repository root:

```bash
node scripts/verify-stream-009-6.mjs
node --test scripts/tests/verify-stream-009-6.test.mjs scripts/tests/stream-009-6-perf.test.mjs
node scripts/run-stream-009-6.mjs --plan
node scripts/run-stream-009-6.mjs --offline
pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
```

Offline runner requires the usual project dependencies, env with a valid **nonproduction** `DATABASE_URL` to generate Prisma client, but it does not directly open a DB connection for its regressions. Do not point this suite to production configuration.

## Read-only performance baseline (manual only)

Start the local API yourself first. Then, from the repository root:

```bash
node scripts/perf/health-probe.mjs --help
node scripts/perf/health-probe.mjs --url http://127.0.0.1:4000/api/v1/health --requests 40 --concurrency 2 --timeout-ms 1500 --max-errors 0
```

Optional preliminary acceptance threshold: add `--p95-ms 500`. **500 ms is an example target, not a measured baseline or guaranteed SLA.** Record system/host state, output, and run count before selecting a lasting budget. At most 200 GET requests, at most 8 concurrent; the default is 40 requests and concurrency 2. Only loopback HTTP `/api/v1/health` URLs with no query/credentials are accepted. No redirects are followed. The sampler is not automatically executed by CI or the offline runner. It does not benchmark Postgres, Redis, authenticated routes or transcoding throughput.

## Operational acceptance and risk boundaries

1. The `quality`, `security-regression`, and `analytics-postgres` jobs must actually pass on GitHub; static evidence checks alone are not enough.
2. Confirm the database integration/rollback check passes against an **isolated** PostgreSQL instance. The retention job must never point at production.
3. Confirm the local health probe only after starting the local API. Report p50 and p95, errors and conditions; do not compare unmeasured systems.
4. Prior 009.2 security tests use mocked Redis, so real multi-replica Redis failover/availability remains a **separate** staging exercise. Likewise HTTP fixtures are not browser E2E; `node scripts/run-stream-008-8.mjs --read` is an optional read-only browser check against an intentionally configured environment.
5. Production rollout/rollback, persistent metrics collection, incident alerts, live streaming load, worker capacity under real FFmpeg and PostgreSQL query-plan performance remain in 009.7 and 009.8 acceptance. If any CI step fails, fix the failing implementation/test before merging; avoid disabling the gate.

## Integration and rollback

This package is additive; remove the introduced `.github/workflows/streamlab-ci.yml`, `scripts/verify-stream-009-6.mjs`, `scripts/run-stream-009-6.mjs`, `scripts/lib/stream-009-6-perf.mjs`, `scripts/perf/health-probe.mjs`, `scripts/tests/stream-009-6-perf.test.mjs` and `scripts/tests/verify-stream-009-6.test.mjs`, the new HTTP boundary test, and these docs to revert it. No database migration rollback is necessary for this package.
