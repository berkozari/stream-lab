# STREAM-009.2 — Authentication & API Hardening

**Status:** patch prepared, runtime validation pending. This is not a production release approval.

## Scope

- Removes four **concrete** auth/CSRF/playback signing values from tracked `.env.example` (F01), and replaces machine-specific FFmpeg paths with command names. The old values may still be present in an existing untracked `.env`; **applying the patch does not rotate them**.
- Extends `pnpm setup:auth:secrets` to generate four unique values in a local `.env` **only when keys are empty or absent**. It does not print secrets and leaves already populated keys intact. Set your own production secrets using the secret manager of the hosting platform; never commit `.env`.
- Keeps existing token lifetime, HMAC mechanics, CSRF cookies, Origin check, and HTTP response contracts unchanged.
- Reuses installed `express-rate-limit` and `ioredis`; adds **no dependency, database migration, or Redis schema migration**.
- Replaces process-local counters for `/api/v1/auth/{register,login,refresh}` and `POST /api/v1/videos/:videoId/analytics/events` with four route-scoped Redis counters in production. Limits and windows remain `8/15m`, `10/15m`, `60/15m` and `120/1m` respectively.
- Adds a small Redis Lua fixed-window store that increments/sets expiry atomically. A Redis outage returns `503 RATE_LIMIT_STORE_UNAVAILABLE` rather than bypassing rate limits. Memory counters remain available only in local development/tests.
- Uses `TRUST_PROXY_CIDRS` as an explicit allowlist of **immediate reverse-proxy source IPs**. `X-Forwarded-For` is untrusted by default; never configure a wide/open CIDR and protect the API origin from direct public access behind the ingress. This does **not** add cryptographic protection to forwarded headers.

## Configuration / rollout

Copy the new `.env.example` only if setting up a **new** local environment. For an existing `.env`, do not overwrite database/storage settings or working credentials. Add these variables manually:

```dotenv
# local (single process)
RATE_LIMIT_STORE=memory
TRUST_PROXY_CIDRS=
# For multi-instance or production (required)
# RATE_LIMIT_STORE=redis
# REDIS_URL=redis://<your-private-redis>
# TRUST_PROXY_CIDRS=<literal-IP-or-CIDR-of-trusted-ingress>
```

In `NODE_ENV=production`, `RATE_LIMIT_STORE=redis` is mandatory (or can be omitted, since it defaults to Redis) and `REDIS_URL` must be explicit. Start Redis before API rollout; test an outage and recovery. Redis needs working `EVAL`, `GET`, `INCR`, `DECR`, `PEXPIRE`, `PTTL`, and `DEL` permissions. All API replicas must share the **same Redis**, namespace, and clock assumptions; use network ACLs/TLS and credentials in deployment.

If you used one of the **old committed example secret values** in `.env`, staging or production, schedule a coordinated rotation. **Do not silently rotate on startup:** an auth access signing-secret rotation invalidates existing JWTs; refresh HMAC rotation invalidates stored refresh token digests; changing the CSRF secret invalidates CSRF contexts, and playback signing-secret rotation invalidates active HLS capabilities. Plan a re-login/renewal experience, verify sessions and cookies, and perform any necessary storage/session cleanup according to the runbook. Do not paste secret values or `.env` contents into chat or issue logs.

The URL scheme for Redis should be `rediss://` when the provider requires TLS; do not expose Redis directly on the Internet. `TRUST_PROXY_CIDRS` must identify the actual proxy source addresses as seen by Express (account for Docker/Kubernetes network topology). Check `X-Forwarded-For` handling with your ingress before enabling trusted proxy CIDRs. Leave empty if directly exposed without a trusted ingress.

## Tests and acceptance

1. `node --test scripts/tests/verify-stream-009-2.test.mjs` — offline file/secret generation checks.
2. `node scripts/verify-stream-009-2.mjs` — 8 static source contract checks, no service dependency.
3. `pnpm --filter @streamlab/api test:hardening` — Node/tsx tests: counters across app instances, header spoof protection, trusted proxy, Redis failure, counter reset, invalid CIDR.
4. `pnpm --filter @streamlab/api test:security` and `pnpm --filter @streamlab/api test:login` / `test:refresh` / `test:register` — auth regression, including CSRF and JWT.
5. `pnpm lint && pnpm typecheck && pnpm format:check && pnpm build` — project quality gates.
6. On staging only, with isolated disposable credentials and Redis, test two **actual** replicas pointing at the same Redis (shared 429), Redis outage (503), request ID and no secret leakage, and real ingress XFF behavior. Local fake-Redis integration tests cannot certify production Redis/network behavior.
7. Check `git diff --check`, Prisma migration status, staging CI and PR review before merge.

No production DB, Redis, CI, HLS player, or browser execution was performed as part of preparing this patch. Remaining F03 (GitHub Actions) is planned for STREAM-009.6, not solved by this change.
