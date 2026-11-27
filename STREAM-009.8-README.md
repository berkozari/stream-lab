# STREAM-009.8 — Final Regression & Milestone Closure

This is a **read-only inspection and opt-in offline regression package**. It does not modify application logic, dependencies, Prisma schema or GitHub Actions. There is no migration, production operation, destructive analytics write or browser write test.

## Included files

- `scripts/lib/stream-009-8-audit.mjs` — pure source checks and command definitions; reuses prior 008.9 tracked-path safety audit.
- `scripts/verify-stream-009-8.mjs` — `--plan`, `--inspect-only` (default), and `--offline`.
- `scripts/tests/verify-stream-009-8.test.mjs` — helper and CLI safety tests.
- `docs/stream-009-milestone-closure.md` — evidence inventory, unresolved runtime gates, rollback and PR acceptance criteria.
- `STREAM-009.8-README.md` — installation and verification instructions.

## Installation

From the project root **on the STREAM-009 feature branch**, after checking `git status --short`:

```bash
unzip -o ~/Desktop/streamlab-STREAM-009.8-final-closure.zip -d .
```

The package only adds five files. It depends on the earlier STREAM-008.9 audit helper and STREAM-009.1–009.7 verifiers being present.

## Tests

```bash
node --test scripts/tests/verify-stream-009-8.test.mjs
node scripts/verify-stream-009-8.mjs --plan
node scripts/verify-stream-009-8.mjs --inspect-only
node scripts/verify-stream-009-8.mjs --offline
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

`--offline` repeats the earlier static checks and runs the existing STREAM-009.6 security/worker offline regression. It also runs Prettier, ESLint, TypeScript, Prisma schema validation and build; the separate commands at the end are optional confirmations. It **does not** run Docker or PostgreSQL integration tests, GitHub Actions, E2E or migration deployment. CI, staging and backup/restore remain explicit release gates detailed in the documentation.

If Prettier warns about package files, apply only to these:

```bash
pnpm exec prettier --write STREAM-009.8-README.md docs/stream-009-milestone-closure.md scripts/lib/stream-009-8-audit.mjs scripts/verify-stream-009-8.mjs scripts/tests/verify-stream-009-8.test.mjs
```

**Closure outcome:** clean static/offline gates support engineering-code milestone completion. They are not production certification or permission to merge without PR/CI review.
