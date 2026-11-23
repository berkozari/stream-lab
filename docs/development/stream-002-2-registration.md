# STREAM-002.2 — Register API

## Scope

- Reuses `packages/contracts/src/api/auth.ts` `RegisterRequestSchema` and HTTP `201` session envelope.
- Implements `GET /api/v1/auth/csrf` to issue the anonymous-context CSRF token/cookie.
- Implements `POST /api/v1/auth/register` with exact Origin and CSRF header verification, validation, Argon2id hashing, atomic nested `User` + `AuthSession` creation, 10-minute JWT and HttpOnly refresh cookie.
- Database schema remains unchanged; `AuthSession` already exists from STREAM-001.5.
- Returns `409` on Prisma P2002 unique violations (including concurrent registration); never exposes password hash in JSON.
- Registers a process-local rate limiter for local development. Before deploying more than one API instance, replace it with a distributed limiter and add a per-identity strategy.

## Deferred work

- Login (STREAM-002.3), refresh rotation/replay detection and session-bound CSRF (STREAM-002.4), logout and authenticated route middleware (STREAM-002.5), React UI (STREAM-002.6/7).
- New CSRF context after registration is deliberately rotated. Obtain another token with GET `/auth/csrf` before attempting later cookie-authenticated mutations. This implementation is **pre-auth CSRF**, not yet the full session-bound flow described in ADR-009.
- A 10-minute access token is returned, but authenticated routes do not consume it until STREAM-002.5. Do not treat this as a complete authentication system.
- Session expiry uses 7 days for the current refresh cookie and session. Sliding idle expiry and the 30-day absolute limit will be handled in the refresh milestone.

## Setup

```bash
pnpm install
pnpm setup:auth:secrets
pnpm format
pnpm test:auth:register
pnpm check
```

Run the API and PostgreSQL, then verify a database round trip using a unique disposable account:

```bash
pnpm dev:api
# in a second terminal
pnpm smoke:auth:register
```

Test script deletes only its own unique test account and associated session. No DB reset.

## Manual request sequence

1. `GET /api/v1/auth/csrf` with trusted `Origin`. Preserve the returned `streamlab_csrf_context` cookie and JSON `data.csrfToken`.
2. `POST /api/v1/auth/register` with `Origin`, `Cookie`, `X-CSRF-Token`, JSON `email`, `displayName`, `password`.
3. On `201`, read the access token from JSON and store it only in memory. Refresh token stays in the HttpOnly cookie.
4. Do not test password or refresh secrets in screenshots/logs; use synthetic test credentials.

## Verification gates

- `pnpm verify:auth:register`
- `pnpm test:auth:register` (no database required; injected repository and HTTP service)
- `pnpm check` (existing baseline regression)
- `pnpm smoke:auth:register` (real API + PostgreSQL)
- Review `git diff --check` and make sure `.env` is not staged.
