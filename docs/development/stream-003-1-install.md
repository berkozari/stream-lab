# STREAM-003.1 — Installation and validation

This patch **does not modify** `apps/api/prisma/schema.prisma` and does not create a migration; the Video schema already exists from STREAM-001.5.

## Install

1. Commit or stash your work before applying changes.
2. Extract the ZIP at repository root, then apply the safe, repeatable installer:

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.1_Video_Domain_Design_Patch.zip" -d .
node apply-stream-003-1.mjs
rm -rf stream-003-1-payload
rm apply-stream-003-1.mjs
pnpm format
```

## Verify

```bash
pnpm verify:video:model
pnpm db:validate
pnpm db:migrate:status
pnpm check
```

The schema verifier is database-independent. For the PostgreSQL transaction smoke test, ensure Docker infrastructure and the existing migrations are available:

```bash
bash scripts/infra-up.sh
pnpm smoke:video:model
```

The smoke test does **not** require a running API HTTP server. It starts a Prisma transaction, creates one temporary user and video, validates ownership, defaults and visibility, then deliberately rolls back; it does not leave test rows behind. Do not run database tests against production.

The root `check` command includes the static video schema verifier, **not** the database smoke test. This preserves fast CI/static checks.

On success, commit the documentation, verifier, smoke test and package scripts. Continue with STREAM-003.2 metadata contracts.
