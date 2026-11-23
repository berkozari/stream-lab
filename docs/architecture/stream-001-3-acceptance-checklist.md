# STREAM-001.3 — Acceptance checklist

- [x] Define one root ESLint flat config for Web/API/Worker/Contracts.
- [x] Apply React Hooks rules only to Web files.
- [x] Define Prettier config and ignore patterns.
- [x] Preserve strict TypeScript flags and add unused/override checks.
- [x] Document naming, import, layering, Git and commit conventions.
- [x] Add Husky/lint-staged configuration and safe pre-Git initialization behavior.
- [x] Add `lint`, `format`, `format:check`, `check` scripts.
- [x] Statical structure checks pass with Node, no package registry required.
- [ ] `pnpm install` completes and lockfile is updated on developer machine.
- [ ] `pnpm format && pnpm lint && pnpm typecheck && pnpm build && pnpm check` pass locally.
- [ ] Git hook is initialized after `git init` and tested on a real staged change.

**Status:** Configured, pending local runtime verification.
