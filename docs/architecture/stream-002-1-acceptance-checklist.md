# STREAM-002.1 — Acceptance checklist

This task is **documentation-only**; no new dependency, migration, or endpoint should be applied.

- [x] Authentication architecture follows API layer-based and Web feature-based conventions.
- [x] Password hashing, JWT claims, lifetimes, refresh cookie and session source of truth defined.
- [x] Rotation and historical-token replay design described, including concurrency handling.
- [x] CSRF, CORS, Origin and production deployment assumptions documented.
- [x] Owner/admin authorization boundaries explicit.
- [x] Existing AuthSession / OpenAPI / shared auth schemas reviewed; proposed deltas identified.
- [x] Implementation dependency order (STREAM-002.2 through 002.9) documented.
- [ ] Review ADR-009 and agree defaults before first implementation.
- [ ] Commit docs to STREAM-002 branch.

## Smoke verification (no new dependencies)

```bash
pnpm format
pnpm format:check
pnpm check
```

Documentation files are not proof of security implementation; all corresponding behavior will be verified at feature milestones.
