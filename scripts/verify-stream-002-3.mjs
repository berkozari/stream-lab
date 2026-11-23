import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const required = [
  'apps/api/src/repositories/auth-session.repository.ts',
  'apps/api/tests/unit/auth-login.service.test.ts',
  'apps/api/tests/integration/auth-login.http.test.ts',
  'apps/api/scripts/auth-login-smoke.ts',
  'docs/development/stream-002-3-login.md',
];
for (const file of required) assert.ok(existsSync(file), `Missing ${file}`);
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
assert.ok(root.scripts['verify:auth:login']);
assert.ok(root.scripts['test:auth:login']);
assert.ok(root.scripts['smoke:auth:login']);
assert.ok(api.scripts['test:login']);
assert.ok(api.scripts['smoke:login']);
const files = {
  app: readFileSync('apps/api/src/app.ts', 'utf8'),
  router: readFileSync('apps/api/src/routes/auth.routes.ts', 'utf8'),
  controller: readFileSync('apps/api/src/controllers/auth.controller.ts', 'utf8'),
  service: readFileSync('apps/api/src/services/auth.service.ts', 'utf8'),
  repo: readFileSync('apps/api/src/repositories/user.repository.ts', 'utf8'),
  spec: readFileSync('apps/api/docs/openapi/openapi.yaml', 'utf8'),
};
assert.match(files.app, /login: options\.login/);
assert.match(files.router, /'\/login'/);
assert.match(files.controller, /createLoginController/);
assert.match(files.service, /createLoginService/);
assert.match(files.repo, /findLoginUserByEmail/);
assert.match(files.spec, /operationId: loginUser[\s\S]*?x-streamlab-status: implemented/);
assert.doesNotMatch(root.scripts['smoke:auth:login'], /contracts build/);
console.log(
  'PASS: STREAM-002.3 login files, scripts, DI wiring, OpenAPI and no-build smoke command',
);
