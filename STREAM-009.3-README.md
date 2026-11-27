# STREAM-009.3 — Worker Reliability

This patch is for the StreamLab project root; extract with `unzip -o streamlab-STREAM-009.3-worker-hardening.zip -d .` after reviewing your current branch. It changes worker source/tests, root and worker package scripts, sample env documentation and adds a static audit.

## Quick verification

```bash
node --test scripts/tests/verify-stream-009-3.test.mjs
node scripts/verify-stream-009-3.mjs
pnpm --filter @streamlab/worker test:hardening
pnpm --filter @streamlab/worker test:hls:integration
pnpm exec prettier --write apps/worker/src/services/transcoding/resource-budget.ts apps/worker/src/services/transcoding/publish-hls.ts apps/worker/src/services/transcoding/ffmpeg-hls.ts apps/worker/src/services/storage/hls-objects.ts apps/worker/tests/unit/resource-budget.test.ts apps/worker/tests/unit/hls-publish.test.ts apps/worker/tests/unit/ffmpeg-hls.test.ts apps/worker/tests/unit/hls-storage.test.ts docs/stream-009.3-worker-reliability.md STREAM-009.3-README.md scripts/lib/stream-009-3-audit.mjs scripts/tests/verify-stream-009-3.test.mjs scripts/verify-stream-009-3.mjs
pnpm lint && pnpm typecheck && pnpm format:check && pnpm build
git diff --check && git status --short
```

Full explanation and migration considerations: `docs/stream-009.3-worker-reliability.md`.

**Limitations:** No live PostgreSQL/Redis/S3 stack, FFmpeg, local `pnpm` dependencies or CI were available to this patch author. Offline static checks are not runtime assurance. Explicitly validate the 4-hour / 4K defaults against product requirements before enabling them for real users.
