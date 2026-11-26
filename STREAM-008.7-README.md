# STREAM-008.7 — Security, Performance & Data Quality

This is a **non-invasive audit/test package**. It adds four files and does not overwrite application source, Prisma files, or existing tests.

## Install

From the StreamLab repository root:

```sh
unzip -n "$HOME/Downloads/streamlab-STREAM-008.7-audit-tests.zip" -d .
```

If files already exist, compare them rather than overwriting them. Do not run the command from `/tmp`.

## Validate

```sh
pnpm exec prettier --write \
  apps/api/tests/unit/stream-008-analytics-data-quality.test.ts \
  apps/api/tests/unit/stream-008-creator-metrics-quality.test.ts \
  scripts/verify-stream-008-7.mjs \
  docs/stream-008-security-data-quality.md

node scripts/verify-stream-008-7.mjs --check
node scripts/verify-stream-008-7.mjs
```

Expected: `[STREAM-008.7] PASS: 9/9 offline gates.` when all pnpm checks pass. Real database query plans and browser/security checks must be validated separately.
