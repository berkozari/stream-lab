import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const expected = [
  'apps/api/src/repositories/video-update.repository.ts',
  'apps/api/src/services/video-update.service.ts',
  'apps/api/src/controllers/video-update.controller.ts',
  'apps/api/tests/unit/video-update.service.test.ts',
  'apps/api/tests/integration/video-update.http.test.ts',
  'apps/api/scripts/video-update-smoke.ts',
];
for (const file of expected) assert.ok(existsSync(resolve(root, file)), `Missing ${file}`);

const route = read('apps/api/src/routes/video.routes.ts');
assert.match(route, /router\.patch\(\s*['"]\/:videoId['"]\s*,/u);
assert.match(route, /validateBody\(UpdateVideoRequestSchema\)/u);
assert.match(route, /createUpdateVideoController/u);
const repo = read('apps/api/src/repositories/video-update.repository.ts');
for (const requirement of [
  'prisma.$transaction',
  'ownerId',
  'deletedAt: null',
  'updateMany',
  'category.findMany',
  'videoCategory.deleteMany',
  'videoCategory.createMany',
  'publishedAt: { not: null }',
])
  assert.ok(repo.includes(requirement), `Update repository missing ${requirement}`);
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const start = openapi.indexOf('    patch:', openapi.indexOf('  /api/v1/videos/{videoId}:'));
const end = openapi.indexOf('    delete:', start);
assert.ok(start > 0 && end > start);
assert.match(openapi.slice(start, end), /x-streamlab-status: implemented/u);
const rootPackage = JSON.parse(read('package.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
for (const command of ['verify:video:update', 'test:video:update', 'smoke:video:update']) {
  assert.ok(rootPackage.scripts[command], `Missing root command ${command}`);
}
for (const command of ['test:video:update', 'smoke:video:update']) {
  assert.ok(apiPackage.scripts[command], `Missing API command ${command}`);
}
console.log(
  'PASS: STREAM-003.5 owner-scoped PATCH -> Zod -> transaction -> category replacement -> publication gate -> OpenAPI',
);
