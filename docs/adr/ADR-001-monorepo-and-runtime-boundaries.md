# ADR-001 — Monorepo and runtime boundaries

- **Status:** Accepted for MVP
- **Date:** 2026-11-23
- **Milestone:** STREAM-001.1

## Context

StreamLab needs a React website, an HTTP API, and a CPU-intensive transcoding worker. The user has established an existing `apps/web` and `apps/api` folder convention. Sharing types and scripts must not create coupling between runtime processes.

## Decision

- Use a single Git repository with pnpm workspaces.
- Runtime applications: `apps/web`, `apps/api`, `apps/worker`.
- `apps/api`: modular monolith with one deployable API; `apps/worker`: separately started/scaled Node.js process (not a microservice with its own public API).
- `packages/contracts`: shared wire DTOs, queue payload types, and Zod schemas **only when genuinely needed**; use `workspace:*` dependencies.
- Prisma schema/migrations remain in `apps/api/prisma`; see ADR-006 for the possible dedicated shared DB client package.
- Infrastructure: `compose.yaml` with PostgreSQL, Redis and MinIO for local development. Initially host-run web/API/worker for fast reload. Optional containerization later.
- Do not introduce Nx/Turborepo, event bus or separate microservices at setup time.

## Alternatives considered

- **Three independent repositories:** simpler independent releases, but harder integration and duplicated contracts.
- **Full microservices:** unnecessary latency, infrastructure and distributed data consistency cost.
- **Single web/API process running FFmpeg:** blocks/contends with latency-sensitive API workloads.

## Consequences

Clear deployable boundaries and one lockfile. Build/package dependency order must be defined. Code reuse flows through stable packages rather than imports from another app's `src`. Worker has independent environment and shutdown behavior.

## Verification

`pnpm -r typecheck` works after initialization; web, API and worker start separately; no cross-app source imports.
