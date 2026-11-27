#!/usr/bin/env node
/** STREAM-009.2: offline source-contract verifier. No network, Redis, DB or writes. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');
const files = {
  sample: read('.env.example'),
  secrets: read('scripts/setup-auth-secrets.mjs'),
  env: read('apps/api/src/config/env.ts'),
  proxy: read('apps/api/src/lib/trusted-proxy.ts'),
  app: read('apps/api/src/app.ts'),
  redis: read('apps/api/src/lib/redis-rate-limit-store.ts'),
  policy: read('apps/api/src/lib/request-rate-limit.ts'),
  auth: read('apps/api/src/routes/auth.routes.ts'),
  video: read('apps/api/src/routes/video.routes.ts'),
  unit: read('apps/api/tests/unit/redis-rate-limit-store.test.ts'),
  http: read('apps/api/tests/integration/redis-rate-limit.http.test.ts'),
  guide: read('docs/stream-009.2-api-hardening.md'),
};
const secretKeys = [
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_REFRESH_TOKEN_HMAC_SECRET',
  'AUTH_CSRF_SECRET',
  'PLAYBACK_SIGNING_SECRET',
];
const checks = [
  {
    name: 'Example secrets are blank',
    ok: secretKeys.every((key) => new RegExp(`^${key}=$`, 'm').test(files.sample)),
  },
  {
    name: 'Auth/playback secret setup is idempotent',
    ok:
      secretKeys.every((key) => files.secrets.includes(`'${key}'`)) &&
      files.secrets.includes('existing[1].trim().length > 0'),
  },
  {
    name: 'Production mandates Redis counters',
    ok:
      files.env.includes("env.NODE_ENV === 'production'") &&
      files.env.includes("rateLimitStoreMode !== 'redis'") &&
      files.env.includes('!env.REDIS_URL'),
  },
  {
    name: 'Proxy trust is bounded',
    ok:
      files.proxy.includes("import { isIP } from 'node:net'") &&
      files.proxy.includes('prefix < 1') &&
      files.app.includes(
        "app.set('trust proxy', trustedProxyCidrs.length ? trustedProxyCidrs : false)",
      ),
  },
  {
    name: 'Atomic shared Redis store',
    ok:
      files.redis.includes("redis.call('INCR'") &&
      files.redis.includes("redis.call('PEXPIRE'") &&
      files.redis.includes('readonly localKeys = false') &&
      files.redis.includes('RATE_LIMIT_STORE_UNAVAILABLE'),
  },
  {
    name: 'Rate-limiter fails closed',
    ok:
      files.policy.includes('passOnStoreError: false') &&
      files.policy.includes('new RedisRateLimitStore'),
  },
  {
    name: 'All four guarded endpoints use shared policy',
    ok:
      ['auth-register', 'auth-login', 'auth-refresh'].every((scope) =>
        files.auth.includes(`scope: '${scope}'`),
      ) &&
      files.video.includes("scope: 'playback-analytics'") &&
      !files.auth.includes("import { rateLimit } from 'express-rate-limit'") &&
      !files.video.includes("import { rateLimit } from 'express-rate-limit'"),
  },
  {
    name: 'Regression and migration guidance present',
    ok:
      files.unit.includes('two Redis rate-limit stores') &&
      files.http.includes('spoofed XFF') &&
      files.http.includes('Redis unavailability') &&
      files.guide.includes('RATE_LIMIT_STORE=redis'),
  },
];
for (const { name, ok } of checks) {
  console.log(`[STREAM-009.2] ${ok ? 'PASS' : 'FAIL'}: ${name}`);
}
if (checks.some((item) => !item.ok)) {
  process.exitCode = 1;
} else {
  console.log(
    `[STREAM-009.2] PASS: ${checks.length}/${checks.length} static source checks (not runtime certification).`,
  );
}
