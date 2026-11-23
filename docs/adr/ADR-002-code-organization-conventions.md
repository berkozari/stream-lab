# ADR-002 — Established Web and API folder conventions

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

The user already has working project conventions, and changing organization without a demonstrated need creates cognitive overhead.

## Decision

### Web: feature-based

Retain `apps/web/src/app/{providers,router}`, `features/<domain>/{components,hooks,services,schemas,types,utils}` as needed, `pages/`, `layout/`, `components/{ui,layout,shared}`, `stores/`, `lib/`, `services/api/`, `styles/`, `utils/`, `types/`.

StreamLab-specific domains: `auth`, `videos`, `uploads`, `playback`, `discovery`, `history`, `creator`. Route pages compose features. Features own their service/query hook/query keys. Global shared folders do not absorb feature-specific components.

Server state: TanStack Query. Ephemeral UI/local state: React; Zustand only for genuine cross-page client state. Forms: React Hook Form + Zod. Shared DTOs may come from `packages/contracts` (not the Prisma generated types).

### API: layer-based

Retain `apps/api/src/{config,routes,controllers,services,repositories,schemas,middlewares,lib,utils,types}`; `src/app.ts` creates the Express app, `src/index.ts` starts it. Retain `apps/api/prisma`, `docs/openapi`, `tests/{unit,integration,helpers}`. Naming examples: `video.routes.ts`, `video.controller.ts`, `video.service.ts`, `video.repository.ts`, `video.schema.ts`.

### Separation rules

- Route: endpoint composition and middlewares; Controller: transport mapping; Service: business rules; Repository: data access.
- `services` may use storage/queue abstractions. Controllers never call Prisma or FFmpeg directly.
- `apps/worker` owns FFprobe/FFmpeg process execution and temporary media processing.
- Avoid empty directories and boilerplate layers for simple functionality.

## Alternatives

Feature-first API and layer-based frontend were considered but rejected to preserve established conventions.

## Tradeoffs

API cross-layer changes may touch several directories; keep consistent filenames and tests. Feature reuse requires explicit public boundaries.

## Verification

An authentication endpoint and video endpoint can be traced from route to repository without business rules leaking into controllers.
