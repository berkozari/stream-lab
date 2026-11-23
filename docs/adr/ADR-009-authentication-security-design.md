# ADR-009 — Authentication security design and session lifecycle

- **Project:** StreamLab VOD
- **Milestone / task:** STREAM-002.1
- **Status:** Proposed for acceptance (documentation only; no auth endpoint is implemented by this ADR)
- **Date:** 2026-11-23
- **Related:** ADR-007 (accepted high-level authentication decision), STREAM-001.9 HTTP contracts

## Context

StreamLab is a first-party React SPA with one Express REST API. The app needs authenticated creators and viewers, server-side resource authorization, safe session renewal, and predictable logout. Runtime boundaries stay unchanged: `apps/web` feature-based, `apps/api` layer-based, `apps/worker` independent. Prisma schema ownership stays at `apps/api/prisma`.

The existing Prisma model `AuthSession` stores `id`, `userId`, `refreshTokenHash`, `expiresAt`, `revokedAt`, `createdAt`. The existing HTTP contract defines register, login, refresh, logout, and `/users/me` but has **not implemented** the domain endpoints yet. STREAM-002 work must use migrations, never reset existing data.

## Decision summary

| Area                 | Decision                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Credentials          | Email/password for MVP; no social login or MFA yet                                                                                                                                                            |
| Password storage     | Argon2id with per-password salt provided by the library; start with OWASP minimum 19 MiB, t=2, p=1, measure latency and tune upward as resources permit                                                       |
| Access token         | Signed JWT, fixed algorithm allowlist (HS256 for this single API), 10-minute expiry; validate issuer, audience, subject, expiry and token type                                                                |
| JWT claims           | `sub=userId`, `sid=authSessionId`, `iss=streamlab-api`, `aud=streamlab-web`, `iat`, `exp`, `jti`, `typ=access`; no passwords, secrets, private profile data or canonical permissions cache                    |
| Access token storage | Browser memory only. Attach via `Authorization: Bearer`; do not persist in localStorage or sessionStorage                                                                                                     |
| Refresh token        | 32+ bytes from CSPRNG, opaque and one-time rotating. Store HMAC-SHA256 digest using a server secret (never raw token)                                                                                         |
| Refresh cookie       | Host-only `streamlab_refresh`; `HttpOnly`, `Secure` on HTTPS, `SameSite=Lax`, `Path=/api/v1/auth`; no `Domain`. Under local HTTP, `Secure` disabled only for local development; production must enforce HTTPS |
| Session lifecycle    | PostgreSQL `AuthSession` is the authoritative revocation source; idle expiration 7 days and absolute session limit 30 days (proposed product defaults, configurable)                                          |
| Rotation/replay      | Each refresh consumes one token, issues next token atomically, records consumed-token digest, and revokes session on confirmed replay                                                                         |
| CSRF                 | Exact Origin checking + a server-validated session-bound CSRF token header for cookie-authenticated state changes; `SameSite` is defense in depth                                                             |
| Deployment           | Prefer a single public origin with `/api/v1` reverse-proxied to API; existing Vite `/api` proxy already supports this locally. Explicit credentialed CORS only when intentionally cross-origin                |
| Authorization        | API validates session, user role and resource ownership. Frontend guards only affect navigation UX                                                                                                            |

## Password and account rules

- Reuse the existing `RegisterRequestSchema` (`email`, password 12–128 chars, `displayName`), plus API normalization and explicit uniqueness check backed by database unique constraint.
- Normalize email predictably; never reveal whether an account exists on failed login. Handle register conflict with the existing `409` contract.
- Generate password hashes with Argon2id. Do **not** use SHA-256 to store user passwords. Never log passwords, bearer JWTs, refresh cookies, or full sensitive request bodies.
- Apply per-IP and per-identity throttles to login/register; use generic authentication error messages.

## Access-token policy

- Only a backend-controlled fixed JWT signing key is accepted; do not trust algorithms or verification keys provided in the JWT header.
- Verify signature, `iss`, `aud`, `sub`, `sid`, `exp` and intended token type.
- For authenticated API routes, check the backing `AuthSession` is active; this provides immediate effective invalidation after logout (at the cost of a lightweight server-side lookup). Cache may be considered later with carefully bounded staleness.
- Authorize VIDEO ownership and ADMIN powers against server-side persisted state; do not trust role or ownership from React.

## Refresh token and replay design

The existing `AuthSession.refreshTokenHash` represents only the **current** refresh token digest. On its own, it is insufficient to positively identify reuse of a historical token. STREAM-002.4 will introduce a consumed-token history model (name proposed: `ConsumedRefreshToken`) keyed by digest and linked to `AuthSession`.

For each refresh: resolve the presented token digest; within a DB transaction lock the session (or use equivalent concurrency-safe compare-and-swap), verify active digest and expiration, store consumed digest, issue replacement digest, and commit. If the digest is a previously consumed token, revoke the associated session and clear the cookie. If token is unknown, reject without revoking an arbitrary session. Avoid a "last write wins" rotation race.

A separate browser-tab refresh may trigger replay policy if a stale cookie is used. React must deduplicate refresh requests and coordinate tabs where feasible. Do not silently loosen replay protection by accepting old tokens indefinitely.

Proposed Prisma additions (to be implemented and migrated at STREAM-002.4, **not** in STREAM-002.1):

- `AuthSession.lastUsedAt`, with existing `expiresAt` serving as absolute expiry; keep `revokedAt`.
- `ConsumedRefreshToken`: `id`, `sessionId`, `tokenHash` (unique), `consumedAt`; index by `sessionId` and prune after session expiry.

Store digests of cryptographically random refresh tokens using keyed HMAC-SHA256; Argon2id is for human-memorable passwords, not required for high-entropy random bearer tokens.

## CSRF design and API contract change

- Extend the planned API with `GET /api/v1/auth/csrf`, returning a non-cacheable CSRF token through the response body while setting a host-only HttpOnly browser-context cookie.
- Before login/register the issued token is bound to an anonymous browser context; after a successful login/register, rotate context and acquire a **session-bound** CSRF token. This requires frontend to request a new CSRF token before its first refresh/logout.
- Protected endpoints require `X-CSRF-Token` matching the server-validated browser/session context, plus Origin verification. On browsers without an expected Origin, fail closed unless an explicit trusted-source policy verifies the request.
- Do not expose CSRF values in URLs or logs. Do not send credentials or headers to third-party origins.
- `POST /auth/login` and `POST /auth/register` are also CSRF-protected because they establish a browser session. Update OpenAPI and Zod where needed **before** implementation. `POST /auth/refresh` and `POST /auth/logout` already require `X-CSRF-Token` in the current OpenAPI draft.
- Prefer same-origin deployment; if a later architecture places Web and API on separate sites, revisit cookie `SameSite`, HTTPS, CORS and CSRF assumptions before enabling it.

## State and response behavior

- `POST /api/v1/auth/register`: 201 and existing `SuccessAuthSession` envelope, Set-Cookie refresh. Never return password hash or refresh token.
- `POST /api/v1/auth/login`: 200 and the same response envelope; 401 generic bad credentials.
- `GET /api/v1/auth/csrf`: 200 with CSRF bootstrap DTO; newly specified, not implemented.
- `POST /api/v1/auth/refresh`: 200 with new access token, rotated refresh cookie; 401 on invalid/expired/replayed session; 403 on CSRF failure.
- `POST /api/v1/auth/logout`: 204, revoke session, clear refresh cookie with matching Path/SameSite attributes.
- `GET /api/v1/users/me`: 200 with sanitized `AuthUser`, 401 if unauthenticated/revoked.
- Existing `/api/v1/health` and `/api/v1/health/ready` are unchanged.

## Frontend lifecycle

1. React starts with `accessToken=null` in memory.
2. API client requests `/auth/csrf` if needed.
3. On successful login/register it receives the access token in JSON, keeps it in memory, and refresh cookie stays HttpOnly.
4. Re-bootstrap CSRF after session creation; retry API calls with bearer token.
5. After page reload, call `/auth/csrf`, then `/auth/refresh` to restore session; show loading state until that completes.
6. Coordinate at most one refresh per browser context and retry a failed protected request at most once. Do not retry login/refresh indefinitely.
7. On logout, call authenticated cookie-revocation endpoint with CSRF, clear all local auth state and relevant TanStack Query caches; on refresh failure, clear auth state and redirect to login as appropriate.

## Alternatives considered

- **Access token in localStorage:** rejected due to XSS token disclosure risk.
- **Long-lived access JWT with no server-side check:** rejected due to poor revocation behavior.
- **Cookie-only sessions:** valid simpler option, but rejected in favor of the already accepted JWT + refresh design and learning goals; reconsider if architecture changes.
- **Auth microservice:** rejected; layer-based Express API is sufficient.
- **Naive unsigned double-submit cookie:** rejected; session-bound signed token and Origin checks are stronger.

## Verification criteria

- Registration/login do not leak hashes, credentials or raw refresh values in JSON/logs.
- Invalid signature, wrong audience/issuer/algorithm, expired access token and revoked session are rejected.
- Refresh rotation succeeds once; concurrency tests prove only one winning transaction; known old-token reuse revokes session; random invalid token does not revoke another session.
- CSRF absent/mismatched, untrusted Origin, or invalid cookie fails on protected auth operations.
- Multiple sessions are independent; logout invalidates current session and access tokens bound to it.
- Owner, non-owner, admin permission checks use persisted state.
- Existing contract tests and `pnpm check` remain successful after implementation.

## References

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- RFC 9700, OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700.html
