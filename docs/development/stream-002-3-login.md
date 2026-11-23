# STREAM-002.3 — Login API & Access Token

## Scope

`POST /api/v1/auth/login` uses the existing `User`, `AuthSession`, `auth-security`, `auth-cookies`, and pre-auth CSRF foundations. There is **no Prisma migration** in this task. Browser login UX is part of STREAM-002.6–002.7.

### Request

```http
POST /api/v1/auth/login
Origin: http://localhost:5173
Content-Type: application/json
X-CSRF-Token: <token issued by GET /api/v1/auth/csrf>
Cookie: streamlab_csrf_context=<cookie>

{"email":"creator@example.com","password":"example-password"}
```

Use the `/api/v1/auth/csrf` endpoint to obtain the token and accompanying HttpOnly context cookie. Never hardcode secrets or disable CSRF to make the request work.

### Responses

- `200`: `{ success: true, data: { accessToken, tokenType, expiresInSeconds, user } }` plus HttpOnly refresh cookie and renewed CSRF context.
- `401 INVALID_CREDENTIALS`: identical code/message for unknown email or invalid password.
- `403`: invalid or absent browser Origin/CSRF context.
- `422`: malformed email or empty/overlong password.
- `429 RATE_LIMITED`: process-local throttling (temporary); should be moved to Redis before horizontal scaling.

The new session is persisted only after successful Argon2id verification. JWT expiration is 600 seconds; refresh cookie lifetime is 7 days. The refresh token is stored only as an HMAC digest in PostgreSQL.

### Run

Start infrastructure and API in one terminal:

```bash
bash scripts/infra-up.sh
pnpm dev:api
```

In another terminal, after the API health endpoint returns HTTP 200:

```bash
pnpm verify:auth:login
pnpm test:auth:login
pnpm check
pnpm smoke:auth:login
```

**Important:** The root login smoke command **does not rebuild `@streamlab/contracts`**, which could cause a running `tsx watch` API to restart mid-test. Build contracts before starting the API if necessary, not during the smoke run. `API_BASE_URL` can override the default `http://127.0.0.1:4000`; `WEB_ORIGIN` overrides the default Origin.

The smoke test creates a uniquely named database fixture and cleans up only its own account and sessions. It does not call `/register`, avoiding the registration rate limiter. It does not delete migrations or volumes.

### Security and boundaries

- Response does not expose `passwordHash`, raw `refreshToken`, or token signing secrets.
- A precomputed Argon2id dummy hash is checked when the email is missing, reducing user-enumeration timing discrepancies; uniform response timing is not guaranteed. Rate limiting and monitoring remain essential.
- Login accepts only browser requests with an allowed Origin and a matching pre-auth CSRF context. Request payload validation occurs after CSRF enforcement.
- Session revocation, rotating refresh tokens and replay detection are planned for STREAM-002.4.
- Authorization middleware, `GET /users/me` and logout are planned for STREAM-002.5.
- The registration API and its existing tests must continue to pass unchanged.

## Acceptance criteria

- [ ] Local `pnpm verify:auth:login` PASS
- [ ] `pnpm test:auth:login` PASS
- [ ] Existing `pnpm test:auth:register` PASS
- [ ] `pnpm check` PASS
- [ ] `pnpm smoke:auth:login` PASS while API is running
- [ ] `git diff` reviewed and no secrets committed
