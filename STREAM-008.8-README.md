# STREAM-008.8 — Integration & Playwright E2E

Only **six new test, script and documentation files**. Existing application code, migrations, dependencies and configuration are unchanged.

1. In the StreamLab repository root, install via `unzip -n streamlab-STREAM-008.8-integration-e2e-tests.zip -d .` (use the path to your downloaded ZIP).
2. Run `pnpm exec prettier --write apps/api/tests/integration/creator-analytics.http.test.mjs apps/web/tests/e2e/creator-analytics.spec.ts scripts/run-stream-008-8.mjs scripts/verify-stream-008-8.mjs docs/stream-008-integration-e2e.md` (no existing project README is modified).
3. Run `node scripts/verify-stream-008-8.mjs --check` and `node scripts/verify-stream-008-8.mjs`.
4. Browser: `node scripts/run-stream-008-8.mjs --public`, then `--read`, then `--full` after setting credentials, fixture ID and explicit write consent as documented.

See `docs/stream-008-integration-e2e.md` for safe test data setup and scope. The `--full` mode creates persistent analytics records.
