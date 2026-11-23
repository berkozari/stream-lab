# StreamLab

Video on Demand (VOD) full-stack portfolio project.

## STREAM-001.2 — Monorepo skeleton

- `apps/web`: Vite + React + TypeScript. Feature-based architecture as features are implemented.
- `apps/api`: Express + TypeScript. Layer-based architecture (`routes/controllers/services/repositories/schemas`) as features are added.
- `apps/worker`: standalone Node.js + TypeScript process. BullMQ/FFmpeg follow in STREAM-001.8/005.
- `packages/contracts`: shared API wire contracts; no Prisma-generated types shared with web.
- `docs/adr`, `docs/architecture`: approved architectural decisions and checklists (STREAM-001.1).

**Prisma schema and migrations will live in `apps/api/prisma` when introduced in STREAM-001.5.**
Unused feature directories, configs and infrastructure packages have intentionally not been created.

## Requirements

- Node.js 24 LTS recommended (`.nvmrc`). Vite 8 also supports Node.js >=22.12.
- Corepack and pnpm 10.34.9 (pinned by `packageManager`).

## Setup

```bash
# from the repository root
nvm use                  # if you use nvm (Node 24)
corepack enable
pnpm --version            # expected 10.34.9 via packageManager
pnpm install
pnpm dev
```

Development URLs:

- Web: http://localhost:5173
- API liveness: http://localhost:4000/api/v1/health
- Worker: logs `[worker] Started (queue integration pending)`

Vite proxies `/api` to `http://localhost:4000`, so the Web health badge is an easy smoke check.

## Useful commands

```bash
pnpm dev                # web + api + worker (contracts build first)
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm typecheck          # contracts build, then typecheck all workspaces
pnpm build              # dependency-aware builds via pnpm workspace graph
pnpm verify:scaffold    # static structure verification (no dependencies needed)
```

Run `pnpm install` once before running dev/build/typecheck. Commit the generated `pnpm-lock.yaml` to Git.

## Scope intentionally deferred

- STREAM-001.3: ESLint/Prettier, Git and naming rules
- STREAM-001.4: Docker, PostgreSQL, Redis, MinIO
- STREAM-001.5: Prisma schema and migration
- STREAM-001.6: auth, middleware, env validation, API standards
- STREAM-001.7: React Router, Query providers, Tailwind/shadcn, real feature structure
- STREAM-001.8: BullMQ consumer and processing jobs

## Conventions

- No imports between `apps/web/src`, `apps/api/src` and `apps/worker/src`.
- Shared DTOs only through `@streamlab/contracts`; it is built before other applications.
- Source files use TypeScript and NodeNext-compatible `.js` relative import specifiers for Node runtime.
- `.env` is never committed; `.env.example` documents future configuration. The scaffold starts with defaults.
- This ZIP includes the prior STREAM-001.1 ADRs, so use it as the base repository rather than extracting both archives into separate roots.

## STREAM-001.3 — Development standards

A root ESLint flat config, Prettier, strict TypeScript checks, Conventional Commit conventions, and Husky/lint-staged setup have been added.

```bash
pnpm install
pnpm format      # once to format existing scaffold/docs
pnpm check       # scaffold verification, lint, typecheck, formatting and build
```

If this ZIP was extracted before `git init`, run `git init && pnpm setup:hooks` to enable the pre-commit hook. Preserve your existing `.git` if you already initialized the repository.

See `docs/development/code-standards.md` and `docs/architecture/stream-001-3-acceptance-checklist.md`.
