# STREAM-009.1 — Audit package (add-only)

This ZIP contains **5 new files** and is intended for `feature/stream-009-production-hardening`. It does not replace any existing source files, dependencies, migrations, tests, settings, or Git configuration. Keep an existing `.git` directory and root `.env` untouched.

## Install

From the checked-out StreamLab repository root, unzip the package. Inspect the ZIP contents first if your installer warns about overwrites:

```sh
unzip -l "$HOME/Desktop/streamlab-STREAM-009.1-audit.zip"
unzip "$HOME/Desktop/streamlab-STREAM-009.1-audit.zip" -d .
```

## Non-destructive checks

```sh
node --test scripts/tests/verify-stream-009-1.test.mjs
node scripts/verify-stream-009-1.mjs
pnpm exec prettier --write docs/stream-009.1-production-hardening-audit.md scripts/lib/stream-009-1-audit.mjs scripts/verify-stream-009-1.mjs scripts/tests/verify-stream-009-1.test.mjs STREAM-009.1-README.md
pnpm exec prettier --check docs/stream-009.1-production-hardening-audit.md scripts/lib/stream-009-1-audit.mjs scripts/verify-stream-009-1.mjs scripts/tests/verify-stream-009-1.test.mjs STREAM-009.1-README.md
git status --short
git diff --check
```

Expected: **6 unit tests PASS** and **8/8 static evidence groups PASS**. `WARN` for example secret fields and missing CI is **intentional**: it records open findings, not a failed audit; do not treat it as production readiness. The static runner reads only source paths and `.env.example`; it never reads `.env`, runs migrations, starts servers, opens browsers, or alters files.

Review the audit before deciding 009.2 scope. Prior STREAM-008.9 results are user-reported, not re-executed in this source-only ZIP review. After the report and verification are accepted, commit the **5 new audit files only**, open/review/merge as usual, or keep the same feature branch if following a single-milestone PR workflow.

Next: **STREAM-009.2 — Authentication, API & Rate-Limit Hardening**, beginning with secret-template hygiene, trusted-proxy policy and Redis-coordinated abuse controls. No existing CSRF/session behavior is to be weakened.
