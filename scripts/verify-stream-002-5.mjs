import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import YAML from 'yaml';
const files = [
  'apps/api/src/types/auth.ts',
  'apps/api/src/middlewares/auth.middleware.ts',
  'apps/api/src/middlewares/authorize.middleware.ts',
  'apps/api/src/repositories/current-user.repository.ts',
  'apps/api/src/repositories/session.repository.ts',
  'apps/api/src/services/session.service.ts',
  'apps/api/src/controllers/session.controller.ts',
  'apps/api/src/controllers/user.controller.ts',
  'apps/api/src/routes/user.routes.ts',
  'apps/api/tests/unit/session-authorization.test.ts',
  'apps/api/tests/integration/auth-session.http.test.ts',
  'apps/api/scripts/auth-session-smoke.ts',
];
for (const file of files) assert.ok(existsSync(file), `Missing ${file}`);
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
const doc = YAML.parse(readFileSync('apps/api/docs/openapi/openapi.yaml', 'utf8'));
for (const [method, path] of [
  ['post', '/api/v1/auth/logout'],
  ['get', '/api/v1/users/me'],
]) {
  assert.equal(doc.paths[path]?.[method]?.['x-streamlab-status'], 'implemented');
}
for (const key of ['verify:auth:session', 'test:auth:session', 'smoke:auth:session'])
  assert.ok(root.scripts[key], `Missing root script ${key}`);
for (const key of ['test:session', 'smoke:session'])
  assert.ok(api.scripts[key], `Missing API script ${key}`);
assert.doesNotMatch(
  root.scripts['smoke:auth:session'],
  /contracts build/,
  'Do not rebuild contracts while API is watched',
);
console.log(
  'PASS: STREAM-002.5 auth middleware, logout/current-user routes, OpenAPI, tests and scripts',
);
