# StreamLab — Development Standards

**Milestone:** STREAM-001.3  
**Status:** Adopted (runtime verification pending)  
**Date:** 2026-11-23

## Architecture boundaries

- `apps/web`: feature-based React structure. Domain-specific components/hooks/services stay in their `features/<domain>/` folders.
- `apps/api`: layer-based Express structure: `routes`, `controllers`, `services`, `repositories`, `schemas`, `middlewares`, `config`, `lib`, `utils`, `types`.
- `apps/worker`: independent Node process; FFmpeg operations never run inside API request handlers.
- Shared wire types go through `@streamlab/contracts` only. Never import `apps/*/src` from another app.
- Prisma schema and migrations are owned by `apps/api/prisma` (introduced in STREAM-001.5).
- Avoid placeholder folders/files and abstractions without actual consumers.

## Naming

| File or symbol       | Style                                               | Example               |
| -------------------- | --------------------------------------------------- | --------------------- |
| React component      | PascalCase `.tsx`                                   | `VideoCard.tsx`       |
| React hook           | `useXxx.ts`                                         | `useVideoUpload.ts`   |
| React Query keys     | `<domain>.keys.ts`                                  | `video.keys.ts`       |
| Feature service      | `<domain>.service.ts`                               | `video.service.ts`    |
| Express route        | `<domain>.routes.ts`                                | `video.routes.ts`     |
| Express controller   | `<domain>.controller.ts`                            | `video.controller.ts` |
| Data repository      | `<domain>.repository.ts`                            | `video.repository.ts` |
| Zod schema           | `<domain>.schema.ts`                                | `video.schema.ts`     |
| Middleware           | `<purpose>.middleware.ts`                           | `auth.middleware.ts`  |
| Function/variable    | camelCase                                           | `getVideoById`        |
| Type/interface/class | PascalCase                                          | `VideoUploadStatus`   |
| Constants            | UPPER_SNAKE_CASE for immutable configuration values | `MAX_UPLOAD_BYTES`    |

## Imports and TypeScript

- TypeScript strict mode, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`.
- Prefer `import type` for type-only imports.
- NodeNext code (`api`, `worker`, `contracts`) uses `.js` specifiers for relative TypeScript imports at runtime.
- No TypeScript `any` or `@ts-ignore` without a reviewed explanation. Prefer `unknown` and type narrowing.
- Use `@streamlab/contracts` for shared request/response shapes. Do not expose Prisma models to the browser.
- In Web, server state belongs to TanStack Query; Zustand only for genuinely shared client-side state.

## Formatting and linting

- Two-space indent, LF, single quotes for JavaScript/TypeScript, semicolons, 100-character print width.
- Prettier owns formatting; ESLint checks code correctness and React Hooks rules. Avoid competing style rules.
- ESLint uses a single root `eslint.config.mjs`; React-specific rules apply only in `apps/web`.
- Generated output, dependencies, build artifacts and coverage files are excluded.

```bash
pnpm install
pnpm format          # once after adopting these rules; rewrites tracked sources/docs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm check           # aggregate gate
```

## Git and GitHub

- Branches: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`; e.g. `chore/stream-001-3-standards`.
- Use Conventional Commits: `feat(videos): add metadata validation`, `fix(upload): handle expired session`, `chore(tooling): add quality gates`.
- One logical change per commit, with meaningful commit messages. Commit `pnpm-lock.yaml` after dependency installation.
- Never commit `.env`, secrets, generated Prisma client, `dist`, `coverage`, `node_modules`.
- Prefer focused pull requests documenting scope, verification commands, risks, and screenshots where appropriate.
- New application behavior should have appropriate tests in its own milestone; do not require dummy tests at scaffold stage.

## Pre-commit workflow

- Husky + lint-staged run `eslint --fix` and `prettier --write` for staged code, and Prettier for staged configuration/docs.
- Since ZIP delivery does not contain `.git`, `pnpm install` skips Husky until a Git repository exists.
- Run `git init` once (if needed), then `pnpm setup:hooks`. Check via `git config core.hooksPath` (should be `.husky/_`).
- Keep TypeScript builds and full project checks in `pnpm check`; lint-staged is for fast, staged-file checks.
- To temporarily disable hooks for an emergency fix, use `HUSKY=0 git commit ...` and run full checks separately.

## Verification limitation

Package registry access is required for `pnpm install`, ESLint/Prettier, type checking and build. The ZIP is statically checked in the generation environment; local runtime verification remains a required acceptance criterion.
