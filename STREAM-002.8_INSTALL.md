# STREAM-002.8 — Authentication Security Tests

This patch **adds tests only** and wires them into the existing workspace commands. It does not alter running auth handlers, DB schema, or web app. No new dependencies or Prisma migration.

## Install

1. Commit or back up your current work first.
2. Extract the ZIP into the StreamLab repository root:

   ```bash
   unzip -n "$HOME/Downloads/StreamLab_STREAM-002.8_Auth_Security_Tests_Patch.zip" -d .
   node apply-stream-002-8.mjs
   ```

3. Then run:

   ```bash
   pnpm format
   pnpm verify:auth:security
   pnpm test:auth:security
   pnpm check
   ```

4. Start `pnpm dev:api` in a separate terminal while PostgreSQL is available, and run:

   ```bash
   pnpm smoke:auth:security
   ```

   Expected: `PASS: concurrent refresh (one winner) -> replay revokes family -> JWT denied -> other session survives`

5. After a successful installation, remove temporary installer files:

   ```bash
   rm -rf stream-002-8-payload
   rm apply-stream-002-8.mjs
   ```

## Coverage

- JWT signature, issuer, audience, expiry, not-before, type, subject and session ID checks.
- JWT signature rejection happens before database session lookup.
- Revoked session rejection even for a cryptographically valid JWT.
- RBAC uses server-resolved role, not the client's signed role claim.
- CSRF Origin/context validation for login, register, refresh and logout.
- Auth cookies are HttpOnly, SameSite=Lax, scoped, and not returned in JSON.
- Login attempts are rate limited at attempt 11 with status 429.
- Live PostgreSQL concurrent refresh: exactly one winner, replay revokes the affected session, other device survives.

## Notes

- `pnpm test:auth:security` uses the in-process Express server and injected repositories; it does **not** need a running API or PostgreSQL. `pnpm smoke:auth:security` **does**.
- The concurrent refresh test deliberately forces a replay. It uses a temporary account and deletes its temporary sessions/tokens afterward. If it fails, do **not** weaken the test or disable replay detection: investigate the repository's concurrency behavior.
- Development rate limiting is currently per-process. Multi-instance deployment requires shared Redis-backed limits (a separate production-readiness item).
- `Secure` cookie attribute is conditional on NODE_ENV=production; the local HTTP test does not claim to exercise HTTPS.
- Existing `/users/me` is the only production access-protected route; policy testing covers future admin/video endpoints but does not pretend those routes are already exposed.
