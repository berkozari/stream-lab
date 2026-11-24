import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const required = [
  'apps/api/src/repositories/video-delete.repository.ts',
  'apps/api/src/services/video-delete.service.ts',
  'apps/api/src/controllers/video-delete.controller.ts',
  'apps/api/tests/unit/video-delete.service.test.ts',
  'apps/api/tests/integration/video-delete.http.test.ts',
  'apps/api/scripts/video-delete-smoke.ts',
];
for (const path of required) assert.ok(existsSync(resolve(root, path)), `Missing ${path}`);

// Whitespace-aware checks: Prettier formatting should never break the verifier.
const router = read('apps/api/src/routes/video.routes.ts');
assert.match(router, /router\.delete\(\s*['"]\/:videoId['"]\s*,\s*authenticate\s*,/u);
assert.match(router, /createDeleteVideoController\(options\.delete\)/u);
const app = read('apps/api/src/app.ts');
assert.match(app, /delete\s*:\s*options\.videoDelete/u);
const repo = read('apps/api/src/repositories/video-delete.repository.ts');
for (const snippet of [
  'prisma.video.updateMany',
  'ownerId',
  'deletedAt: null',
  "status: 'DELETING'",
  "visibility: 'PRIVATE'",
  'deletedAt,',
  'result.count !== 1',
])
  assert.ok(repo.includes(snippet), `Delete repository missing ${snippet}`);
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const detail = openapi.indexOf('  /api/v1/videos/{videoId}:');
const next = openapi.indexOf('  /api/v1/videos/{videoId}/publish:', detail);
assert.ok(detail >= 0 && next > detail);
const deletePart = openapi
  .slice(detail, next)
  .match(/\n {4}delete:([\s\S]*?)(?=\n {2}\/api\/v1\/videos\/\{videoId\}\/publish:|$)/u)?.[1];
assert.ok(
  deletePart && /x-streamlab-status:\s*implemented/u.test(deletePart),
  'DELETE must be documented as implemented',
);
assert.match(deletePart, /'202':/u);
const rootPkg = JSON.parse(read('package.json'));
const apiPkg = JSON.parse(read('apps/api/package.json'));
for (const script of ['verify:video:delete', 'test:video:delete', 'smoke:video:delete']) {
  assert.ok(rootPkg.scripts[script], `Root command missing ${script}`);
}
for (const script of ['test:video:delete', 'smoke:video:delete']) {
  assert.ok(apiPkg.scripts[script], `API command missing ${script}`);
}
console.log(
  'PASS: STREAM-003.6 owner-only DELETE -> atomic soft delete -> 202 contract -> hidden records',
);
