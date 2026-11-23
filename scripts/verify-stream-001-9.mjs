import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';

const root = process.cwd();
const fromRoot = (file) => path.join(root, file);
const exists = (file) => assert.ok(fs.existsSync(fromRoot(file)), `Missing: ${file}`);
const readJSON = (file) => JSON.parse(fs.readFileSync(fromRoot(file), 'utf8'));

for (const file of [
  'packages/contracts/src/api/common.ts',
  'packages/contracts/src/api/auth.ts',
  'packages/contracts/src/api/video.ts',
  'packages/contracts/src/api/upload.ts',
  'packages/contracts/src/api/playback.ts',
  'packages/contracts/tests/api-contracts.test.mjs',
  'docs/api/contracts.md',
  'apps/api/docs/openapi/openapi.yaml',
])
  exists(file);

const rootManifest = readJSON('package.json');
const contracts = readJSON('packages/contracts/package.json');
assert.ok(rootManifest.scripts['verify:api:contracts']);
assert.ok(rootManifest.scripts['test:api:contracts']);
assert.ok(rootManifest.scripts.check?.includes('verify:api:contracts'));
assert.ok(rootManifest.scripts.check?.includes('test:api:contracts'));
assert.ok(rootManifest.devDependencies.yaml);
assert.ok(contracts.dependencies?.zod);
assert.ok(contracts.scripts.test);
assert.ok(
  fs.readFileSync(fromRoot('packages/contracts/src/index.ts'), 'utf8').includes("'./api/index.js'"),
);

const input = fs.readFileSync(fromRoot('apps/api/docs/openapi/openapi.yaml'), 'utf8');
const yaml = parseDocument(input, { uniqueKeys: true, strict: true });
assert.equal(yaml.errors.length, 0, yaml.errors.map((item) => item.message).join('\n'));
const document = yaml.toJS();
assert.equal(document.openapi, '3.1.1');
const schemas = document.components?.schemas ?? {};
for (const ref of input.match(/#\/components\/schemas\/[a-zA-Z0-9_-]+/g) ?? []) {
  const name = ref.split('/').at(-1);
  assert.ok(schemas[name], `Broken schema reference: ${ref}`);
}
const paths = document.paths ?? {};
const expected = [
  '/api/v1/health',
  '/api/v1/health/ready',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/users/me',
  '/api/v1/videos',
  '/api/v1/videos/{videoId}',
  '/api/v1/videos/{videoId}/publish',
  '/api/v1/videos/{videoId}/processing',
  '/api/v1/videos/{videoId}/uploads',
  '/api/v1/uploads/{uploadId}/complete',
  '/api/v1/videos/{videoId}/playback',
  '/api/v1/videos/{videoId}/progress',
];
for (const endpoint of expected) assert.ok(paths[endpoint], `Missing path: ${endpoint}`);
let planned = 0;
const operations = new Set();
for (const [p, methods] of Object.entries(paths)) {
  for (const [method, operation] of Object.entries(methods)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    assert.ok(operation.operationId, `Missing operationId: ${method.toUpperCase()} ${p}`);
    assert.ok(
      !operations.has(operation.operationId),
      `Duplicate operationId: ${operation.operationId}`,
    );
    operations.add(operation.operationId);
    if (!p.startsWith('/api/v1/health')) {
      assert.equal(
        operation['x-streamlab-status'],
        'planned',
        `${method.toUpperCase()} ${p} is not implemented`,
      );
      planned++;
    }
  }
}
assert.ok(planned >= 12, `Expected >= 12 planned operations, got ${planned}`);
console.log(
  `PASS: OpenAPI parsed; ${Object.keys(paths).length} paths; ${planned} planned operations; refs, scripts and dependencies verified.`,
);
