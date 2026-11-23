# STREAM-001.10 — Acceptance Checklist

## Fast/static validation

- [ ] `pnpm verify:integration` passes.
- [ ] `pnpm test:integration:smoke` passes with positive/negative fixture cases.
- [ ] `pnpm check` passes (including previous workspace checks).

## Running infrastructure integration

- [ ] Docker Compose containers are healthy and existing infrastructure smoke passes.
- [ ] Prisma migration status is up-to-date and database seed smoke passes.
- [ ] Both private storage buckets support a temporary write/read/delete roundtrip.
- [ ] Anonymous direct reads of temporary storage objects are denied.
- [ ] API liveness/readiness, request IDs, CORS and error responses pass.
- [ ] Web routes return the SPA shell and `/api` proxy returns API health.
- [ ] Normal BullMQ job completes through API producer -> Redis -> Worker.
- [ ] Retry BullMQ job completes after deliberate failure(s).
- [ ] `pnpm smoke:integration` ends with `PASS: STREAM-001.10 integrated infrastructure checks completed.`

## Manual browser validation

- [ ] Home health indicator displays success; Console/Network have no unexpected errors.
- [ ] Creator, Watch placeholder and NotFound pages render.
- [ ] Mobile layout at 375px and 768px has no blocking issue.

## Close-out

- [ ] Confirm no temporary storage objects remain (`_streamlab_smoke/` prefix).
- [ ] Save the terminal output in the implementation notes or PR.
- [ ] Commit tests, docs and manifest changes (not `.env` or generated files).

**Scope:** This validates the STREAM-001 foundation, not actual video upload, transcoding or playback.
