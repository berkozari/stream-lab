# STREAM-001.8 — Acceptance Checklist

- [ ] Worker starts independently from the API using `pnpm dev:worker`.
- [ ] API package contains a producer client; worker package contains consumer.
- [ ] Queue name/payload shared through `@streamlab/contracts`.
- [ ] All required runtime dependencies are declared in their owning workspace.
- [ ] `pnpm verify:worker:foundation` passes.
- [ ] `pnpm test:worker:foundation` passes.
- [ ] `pnpm smoke:queue` completes a real Redis/BullMQ job.
- [ ] `QUEUE_SMOKE_RETRY=1 pnpm smoke:queue` completes after retry.
- [ ] Worker shuts down cleanly on Ctrl+C.
- [ ] `pnpm check` passes after changes.

Scope exclusions: no FFmpeg, media storage, authenticated HTTP enqueue endpoint, or database updates in this milestone.
