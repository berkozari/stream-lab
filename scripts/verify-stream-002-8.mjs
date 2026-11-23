import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const expectedFiles = [
  'apps/api/tests/unit/auth-security-hardening.test.ts',
  'apps/api/tests/integration/auth-security.http.test.ts',
  'apps/api/scripts/auth-security-smoke.ts',
];
for (const path of expectedFiles) {
  assert.ok(existsSync(path), `Missing security test file: ${path}`);
}
assert.equal(root.scripts['verify:auth:security'], 'node scripts/verify-stream-002-8.mjs');
assert.equal(
  root.scripts['test:auth:security'],
  'pnpm --filter @streamlab/contracts build && pnpm --filter @streamlab/api test:security',
);
assert.equal(root.scripts['smoke:auth:security'], 'pnpm --filter @streamlab/api smoke:security');
assert.ok(root.scripts.check.includes('pnpm verify:auth:security'));
assert.ok(root.scripts.check.includes('pnpm test:auth:security'));
assert.ok(api.scripts['test:security'].includes('auth-security-hardening.test.ts'));
assert.ok(api.scripts['test:security'].includes('auth-security.http.test.ts'));
assert.equal(api.scripts['smoke:security'], 'tsx scripts/auth-security-smoke.ts');

// The security milestone adds tests without weakening production auth guarantees.
const auth = readFileSync('apps/api/src/middlewares/auth.middleware.ts', 'utf8');
const csrf = readFileSync('apps/api/src/middlewares/csrf.middleware.ts', 'utf8');
const refresh = readFileSync('apps/api/src/repositories/refresh-token.repository.ts', 'utf8');
assert.match(auth, /jwtVerify/);
assert.match(auth, /findActiveSessionIdentity/);
assert.match(csrf, /equalCsrfToken/);
assert.match(refresh, /updateMany/);
assert.match(refresh, /consumedRefreshToken/);
console.log('PASS: STREAM-002.8 security cases and workspace commands are configured');
