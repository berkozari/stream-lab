# STREAM-003.9 — Video Management Integration & E2E Validation

Extends existing Playwright setup from STREAM-002.9. No new packages or migrations.

## Install

From StreamLab repository root:

```sh
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.9_Video_E2E_Patch.zip" -d .
node apply-stream-003-9.mjs
rm -rf stream-003-9-payload
rm apply-stream-003-9.mjs
pnpm format
```

## Validate

```sh
pnpm verify:video:e2e
pnpm check
bash scripts/infra-up.sh
pnpm db:migrate:status
pnpm test:video:e2e
```

`test:video:e2e` uses existing `playwright.config.ts` webServer configuration to start API and Web when needed. Make sure contracts are already built (`pnpm --filter @streamlab/contracts build` once **before** starting an API watcher). Avoid contract rebuilds while API runs under `tsx watch`.

Video E2E suite tests real browser Create → List → Update → Delete; empty-field validation and 13-video cursor pagination; separate-owner 404 isolation. It uses a maximum of four temporary accounts per suite execution. The test-only cleanup script refuses emails without the exact `streamlab-video-e2e-<uuid>@example.invalid` shape and removes the account's video descendants before deleting the account.

**Registration rate limit:** Repeated E2E runs against the same running API may accumulate the in-memory registration rate-limit counter and produce HTTP 429. Restart the local API process before retrying; never weaken production rate limits or clear the database as a workaround.

**Commands:** `pnpm check` runs structural verification but does not run real-browser E2E. `pnpm test:video:e2e` runs only video tests. `pnpm test:auth:e2e` is scoped to the auth spec when it uses the default command, so the video suite is not run unexpectedly. The default Playwright configuration still discovers both spec files if invoked without a filter.

Physical media upload/transcoding/HLS playback are outside STREAM-003 and are not expected in these tests.
