import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const required = [
  'apps/api/src/repositories/refresh-token.repository.ts',
  'apps/api/src/services/refresh.service.ts',
  'apps/api/src/controllers/refresh.controller.ts',
  'apps/api/tests/unit/refresh.service.test.ts',
  'apps/api/tests/integration/auth-refresh.http.test.ts',
  'apps/api/scripts/auth-refresh-smoke.ts',
  'docs/development/stream-002-4-refresh.md',
];
for (const path of required) assert.ok(existsSync(path), `Missing: ${path}`);
const schema = readFileSync('apps/api/prisma/schema.prisma', 'utf8');
const routes = readFileSync('apps/api/src/routes/auth.routes.ts', 'utf8');
const openapi = readFileSync('apps/api/docs/openapi/openapi.yaml', 'utf8');
const root = JSON.parse(readFileSync('package.json', 'utf8'));
const api = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
assert.match(schema, /model ConsumedRefreshToken\s*\{/);
assert.match(schema, /consumedTokens\s+ConsumedRefreshToken\[\]/);
assert.match(routes, /'\/refresh'/);
assert.match(openapi, /\/api\/v1\/auth\/refresh:[\s\S]*?x-streamlab-status: implemented/);
for (const script of ['verify:auth:refresh', 'test:auth:refresh', 'smoke:auth:refresh'])
  assert.ok(root.scripts[script], `Missing root script ${script}`);
for (const script of ['test:refresh', 'smoke:refresh'])
  assert.ok(api.scripts[script], `Missing API script ${script}`);
assert.doesNotMatch(
  root.scripts['smoke:auth:refresh'],
  /contracts build/,
  'Smoke must not rebuild contracts while API watches files',
);
console.log('PASS: STREAM-002.4 files, schema, routes, OpenAPI and scripts');
