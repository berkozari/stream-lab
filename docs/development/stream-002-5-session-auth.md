# STREAM-002.5 — Logout, current user and authorization

## Added endpoints

- `POST /api/v1/auth/logout`: Requires **Origin + CSRF header and context cookie**. Revokes the session identified by the active refresh cookie, clears the refresh cookie, resets CSRF context and returns **204** without JSON. Missing/stale refresh cookie is an idempotent 204 (after valid CSRF). A consumed token cannot revoke another session through logout.
- `GET /api/v1/users/me`: Requires `Authorization: Bearer <access JWT>`. Verifies signature, issuer, audience, type and expiration, **then validates the session in PostgreSQL**. Returns the public `AuthUser` DTO, never password hash or refresh token data.

## Security properties

- Access JWTs are short lived, but **database-backed session checks make logout effective immediately** for guarded endpoints.
- The session ID (`sid`) from the JWT is not sufficient authorization by itself: look up `sid` + `sub`, and require `revokedAt IS NULL` and `expiresAt > now`.
- Current roles come from PostgreSQL (not a stale role claim). `requireRoles` denies missing principal and denies a disallowed role.
- Resource ownership is represented by `assertCanManageVideo(principal, ownerId)` and must be called **after loading the resource securely** in future Video endpoints; no Video write endpoints are implemented in this milestone.
- `avatarUrl` is null until signed/controlled avatar URL delivery is implemented.
- `POST /auth/logout` is protected against CSRF just like refresh and register; requests without proper Origin/context/header are rejected.
- There is no security guarantee against stolen access JWTs outside of guarded API endpoints or during an ongoing request.

## Tests

From repository root:

```bash
pnpm verify:auth:session
pnpm test:auth:session
pnpm check
```

With PostgreSQL and API running (in another terminal):

```bash
pnpm smoke:auth:session
```

Smoke test creates a unique account and two sessions, revokes only one and verifies its JWT is immediately denied; the other session remains valid. It cleans up its test records.

## Future work

- STREAM-002.6 React auth client, memory-held access token and refresh single-flight.
- STREAM-002.8 more security negative cases, session listing and exhaustive authorization audit.
- All resource-specific authorization must be enforced by the API, never exclusively by React guards.
