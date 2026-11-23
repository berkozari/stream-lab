# ADR-007 — Authentication, authorization and API contracts

- **Status:** Accepted for MVP
- **Date:** 2026-11-23

## Context

Creators manage private resources; viewers can play eligible media. Authentication must support safe session revocation and typed API communications.

## Decision

- Access token: short-lived JWT provided via Authorization Bearer header; keep in client memory rather than localStorage where feasible.
- Refresh token: opaque random token, hash stored in AuthSession table, rotated on refresh and invalidated/revoked on logout. Cookie: HttpOnly, Secure in HTTPS, scoped Path and appropriate SameSite. Handle reuse/replay with token-family revocation or equivalent session policy.
- Protect cookie-authenticated refresh/logout against cross-site requests: SameSite + Origin validation; apply CSRF token strategy if deployment/cookie configuration requires it. CORS explicitly scoped to known frontend origins.
- Authorization is server-side: video owner for editing; ADMIN for limited administrative actions; readiness + visibility checked for playback. Frontend guards are user experience, not security controls.
- API endpoints versioned under `/api/v1` and described in `apps/api/docs/openapi/openapi.yaml`.
- Zod validates request data at API boundary; typed DTOs may be shared through `packages/contracts`, not Prisma entities. Prefer a consistent success/error envelope with correlation requestId and stable machine-readable error codes; document pagination and HTTP statuses.
- Do not expose internals, storage keys or underlying job processing error stacks to public clients.

## Tradeoffs

Refresh rotation and cookie-aware CSRF policy add complexity, but improve revoke/replay handling. JWT is not used as a substitute for per-video authorization.

## Verification

Unauthorized edit/playback requests fail regardless of frontend route guards; token refresh rotates, replay is handled according to policy, and invalid input returns a stable error contract.
