# ADR-006 — PostgreSQL / Prisma ownership and data boundaries

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

Both API and worker need persistence for the video lifecycle. The established API layout keeps Prisma at `apps/api/prisma`; there should be one schema/migration authority.

## Decision

- PostgreSQL is system of record. `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/` and `apps/api/prisma.config.ts` remain canonical.
- Use PostgreSQL transaction boundaries for metadata/state transitions. Redis/BullMQ is a transport, not authoritative long-term video state.
- API is the sole owner of migration scripts. No independent schema mutations in worker.
- API and worker may each read/write the strictly necessary database tables via a shared Prisma client **runtime wrapper**, without moving schema or migrations from API. The exact generated-client packaging (e.g. `packages/database` wrapper) is an STREAM-001.2/001.5 implementation detail and must avoid worker importing `apps/api/src/*` directly.
- Core entities: User, AuthSession, Video, VideoUpload, MediaAsset, VideoRendition, Category, VideoCategory, WatchProgress. Detailed fields and indexes are decided at STREAM-001.5.
- Video status and visibility are orthogonal. Distinguish upload attempt from video entity. Use versioned processing outputs. Enforce unique keys and foreign keys.
- Video deletion is a two-phase operation: logical DELETING state, worker cleanup of storage, and eventual DB removal as allowed by retention policy; do not synchronously delete files in HTTP handler.

## Alternatives

- Duplicate Prisma schemas in each app: rejected as drift hazard.
- Dedicated standalone DB microservice: rejected as extra network boundary and deployment complexity.
- Move schema to `packages/database`: rejected to preserve existing API convention.

## Verification

Only one set of Prisma migrations exists. DB schemas for API and worker do not drift. Cross-app imports respect package boundaries.

## Reference

https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators
