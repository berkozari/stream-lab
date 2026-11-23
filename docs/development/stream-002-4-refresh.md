# STREAM-002.4 — Refresh Token Rotation & Session Management

## Scope

- `POST /api/v1/auth/refresh` uses a valid HttpOnly refresh cookie and `Origin` + `X-CSRF-Token`.
- Each success rotates the token in a conditional database transaction, stores a consumed hash in `ConsumedRefreshToken`, and returns a 10-minute access JWT and updated refresh cookie.
- A previously consumed refresh token invalidates its session **family** (one AuthSession), not every device belonging to the user.
- Invalid, revoked, expired, and consumed tokens receive the same `401 INVALID_REFRESH_TOKEN` response.
- `POST /auth/logout`, account-wide revocation and `/users/me` are still scheduled for STREAM-002.5.

## Limitations and deliberate choices

- The refresh token expiry is sliding (extended to seven days after each successful rotation). Absolute maximum session age is not enforced yet.
- **Concurrent refresh attempts:** a second attempt with the consumed token is treated as replay and may revoke the session. Frontend clients must implement single-flight refresh in STREAM-002.6. Avoid automatic retries that reuse the same refresh token.
- Existing CSRF protection is browser-context HMAC + Origin allowlist. This step does **not** claim full session-bound CSRF protection.
- Rate limiting is currently per API process; migrate to Redis for multi-instance deployment.
- Strictly avoid logging raw refresh cookies, token strings or Authorization headers. DB retains only HMAC digests.
- `ConsumedRefreshToken` history must be retained for the refresh token replay-detection horizon; devise controlled retention/cleanup later. Do not cascade-delete it before detection expires.
- In deployments with concurrent requests or multiple services, ensure timestamp and transactional semantics are consistent. Inspect repository transaction test results before production use.

## Install and verify

1. Back up/commit local changes, unzip patch to repository root, then run `node apply-stream-002-4.mjs`.
2. `pnpm db:validate`
3. `pnpm db:migrate:dev --name add_consumed_refresh_tokens` (database must be running; **do not accept DB reset prompts**).
4. `pnpm db:generate`
5. `pnpm format`
6. `pnpm verify:auth:refresh && pnpm test:auth:refresh && pnpm check`
7. Start API separately (`pnpm dev:api`); then `pnpm smoke:auth:refresh` in another terminal.

The smoke test creates its own user and session and deletes only the fixtures it created. It sends a newly bootstrapped CSRF token during replay, ensuring replay detection actually executes.

## API example

Request: `POST /api/v1/auth/refresh`, with `Origin`, `X-CSRF-Token` and the `streamlab_refresh` cookie. Obtain CSRF token using `GET /api/v1/auth/csrf`.

Success: `200`, `{ "success": true, "data": { "accessToken": "...", "tokenType": "Bearer", "expiresInSeconds": 600, "user": { "...": "..." } } }`, refreshed HttpOnly cookie. Refresh the CSRF context before the next cookie-authenticated mutation.

Failure: `401 INVALID_REFRESH_TOKEN`, refresh cookie cleared. Browser should return to login. Do not automatically retry an already-used token.
