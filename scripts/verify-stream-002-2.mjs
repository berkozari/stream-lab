import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'apps/api/src/config/auth-env.ts',
  'apps/api/src/lib/auth-security.ts',
  'apps/api/src/lib/auth-cookies.ts',
  'apps/api/src/middlewares/csrf.middleware.ts',
  'apps/api/src/routes/auth.routes.ts',
  'apps/api/src/controllers/auth.controller.ts',
  'apps/api/src/services/auth.service.ts',
  'apps/api/src/repositories/user.repository.ts',
  'apps/api/tests/unit/auth-register.service.test.ts',
  'apps/api/tests/integration/auth-register.http.test.ts',
  'packages/contracts/src/api/csrf.ts',
  'apps/api/scripts/auth-register-smoke.ts',
  'docs/development/stream-002-2-registration.md',
  'scripts/setup-auth-secrets.mjs',
];
for (const path of required) assert.ok(existsSync(path), `Missing ${path}`);
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
for (const key of ['argon2', 'jose', 'express-rate-limit'])
  assert.ok(api.dependencies[key], `API missing ${key}`);
for (const key of ['test:register', 'smoke:register'])
  assert.ok(api.scripts[key], `API missing ${key}`);
for (const key of [
  'verify:auth:register',
  'setup:auth:secrets',
  'test:auth:register',
  'smoke:auth:register',
]) {
  assert.ok(root.scripts[key], `root missing ${key}`);
}
const app = readFileSync('apps/api/src/app.ts', 'utf8');
assert.ok(app.includes("'/api/v1/auth'"), 'Auth router not mounted');
const spec = readFileSync('apps/api/docs/openapi/openapi.yaml', 'utf8');
assert.ok(spec.includes('/api/v1/auth/csrf:'), 'OpenAPI csrf path missing');
assert.ok(
  spec.includes('x-streamlab-status: implemented'),
  'OpenAPI implementation marker missing',
);
console.log('PASS: STREAM-002.2 scripts, files, manifest dependencies, app wiring and docs');
