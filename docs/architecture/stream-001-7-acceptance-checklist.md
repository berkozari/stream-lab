# STREAM-001.7 — Acceptance Checklist

- [ ] `node scripts/verify-stream-001-7.mjs` passes
- [ ] `pnpm install` succeeds with root and `@streamlab/web` dependencies
- [ ] `pnpm format` runs successfully and `pnpm check` passes
- [ ] `pnpm --filter @streamlab/web build` succeeds
- [ ] `pnpm dev` serves `/` and `/creator`; unknown route displays custom 404
- [ ] `GET /api/v1/health` displays _Bağlı_ when API is online and _Bağlantı yok_ when stopped
- [ ] `components.json` is detected by `pnpm dlx shadcn@latest add button -c apps/web`
- [ ] No real auth guard is claimed or bypassed in creator placeholder

The shadcn CLI step is intentionally separate from the patch: it downloads the official component implementation and updates dependencies. The project itself runs without shadcn-generated components.
