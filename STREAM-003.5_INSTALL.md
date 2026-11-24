# STREAM-003.5 — Update Video Metadata API

This patch extends the existing STREAM-003.4 implementation without replacing the Video model, contracts or previously implemented routes. It adds authenticated owner-scoped metadata updates and a transactionally replaced category association set.

## Installation (repository root)

```bash
unzip -n "$HOME/Downloads/StreamLab_STREAM-003.5_Video_Update_API_Patch.zip" -d .
node apply-stream-003-5.mjs
rm -rf stream-003-5-payload
rm apply-stream-003-5.mjs
pnpm format
pnpm verify:video:update
pnpm test:video:update
pnpm check
```

For the real PostgreSQL smoke test, start infrastructure (`bash scripts/infra-up.sh`) and the API (`pnpm dev:api`), then from a second terminal:

```bash
pnpm smoke:video:update
```

Read `docs/development/stream-003-5-video-update.md` for the HTTP contract and publishing rules. The script reads and validates all necessary files before making changes and refuses conflicting files. If it stops with an error, do not force-overwrite your local code.
