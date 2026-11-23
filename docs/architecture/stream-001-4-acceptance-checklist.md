# STREAM-001.4 — Acceptance Checklist

- [ ] Copy root `.env.example` to `.env`; use local development credentials only.
- [ ] `docker compose config --quiet` succeeds.
- [ ] `bash scripts/infra-up.sh` starts all three services as healthy.
- [ ] `bash scripts/smoke-infra.sh` succeeds without errors.
- [ ] Both storage buckets exist and are private.
- [ ] Per-bucket CORS is present for local Vite origins.
- [ ] `docker compose down` and restart preserve existing data.
- [ ] `pnpm check` still succeeds on the application workspace.
- [ ] Configuration and scripts reviewed and committed to Git.

## Out of scope

- Database schema and Prisma migrations — STREAM-001.5.
- API integration and validated runtime env — STREAM-001.6.
- Worker + BullMQ integration — STREAM-001.8.
- Presigned upload and HLS streaming — STREAM-004–006.

Only mark STREAM-001.4 complete after **local runtime verification**. Static file checks alone are not sufficient.
