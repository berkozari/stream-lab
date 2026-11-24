import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const files = [
  'apps/api/src/lib/video-cursor.ts',
  'apps/api/src/repositories/video-read.repository.ts',
  'apps/api/src/services/video-read.service.ts',
  'apps/api/src/controllers/video-read.controller.ts',
  'apps/api/tests/unit/video-read.service.test.ts',
  'apps/api/tests/integration/video-read.http.test.ts',
  'apps/api/scripts/video-read-smoke.ts',
];
for (const file of files) assert.ok(existsSync(resolve(root, file)), `Missing ${file}`);
const routes = read('apps/api/src/routes/video.routes.ts');
assert.match(routes, /router\.get\(\s*'\/mine',\s*authenticate/u);
assert.match(routes, /router\.get\(\s*'\/:videoId',\s*optionalAuthentication/u);
assert.match(routes, /createListVideoController\('public'/u);
const repo = read('apps/api/src/repositories/video-read.repository.ts');
for (const required of [
  'deletedAt: null',
  "status: 'READY'",
  "visibility: 'PUBLIC'",
  'publishedAt: { not: null }',
  'take: filter.limit + 1',
]) {
  assert.ok(repo.includes(required), `Repository missing: ${required}`);
}
const service = read('apps/api/src/services/video-read.service.ts');
assert.match(service, /VideoListResponseSchema\.parse/u);
assert.match(service, /VideoResponseSchema\.parse/u);
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const collectionStart = openapi.indexOf('  /api/v1/videos:');
const mineStart = openapi.indexOf('  /api/v1/videos/mine:');
const detailStart = openapi.indexOf('  /api/v1/videos/{videoId}:');
assert.ok(collectionStart >= 0 && mineStart > collectionStart && detailStart > mineStart);
for (const operation of [
  openapi.slice(collectionStart, mineStart),
  openapi.slice(mineStart, detailStart),
  openapi.slice(detailStart, openapi.indexOf('  /api/v1/videos/{videoId}/publish:', detailStart)),
]) {
  assert.match(operation, / {4}get:[\s\S]*?x-streamlab-status: implemented/u);
}
const packageJson = JSON.parse(read('package.json'));
const apiJson = JSON.parse(read('apps/api/package.json'));
for (const name of ['verify:video:read', 'test:video:read', 'smoke:video:read']) {
  assert.ok(packageJson.scripts[name], `Missing root script ${name}`);
}
for (const name of ['test:video:read', 'smoke:video:read']) {
  assert.ok(apiJson.scripts[name], `Missing API script ${name}`);
}
console.log(
  'PASS: STREAM-003.4 public discovery -> mine -> optional JWT detail -> keyset pagination -> OpenAPI',
);
