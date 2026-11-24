import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const expectedFiles = [
  'apps/api/src/routes/video.routes.ts',
  'apps/api/src/controllers/video.controller.ts',
  'apps/api/src/services/video.service.ts',
  'apps/api/src/repositories/video.repository.ts',
  'apps/api/tests/unit/video-create.service.test.ts',
  'apps/api/tests/integration/video-create.http.test.ts',
  'apps/api/scripts/video-create-smoke.ts',
];
for (const path of expectedFiles) assert.ok(existsSync(resolve(root, path)), `Missing ${path}`);

const app = read('apps/api/src/app.ts');
assert.match(app, /createVideoRouter/u, 'Video router is not mounted in Express app');
assert.match(app, /\/api\/v1\/videos/u);
const router = read('apps/api/src/routes/video.routes.ts');
assert.match(router, /requireAuth/u);
assert.match(router, /validateBody\(CreateVideoRequestSchema\)/u);
const repository = read('apps/api/src/repositories/video.repository.ts');
assert.match(repository, /prisma\.\$transaction/u);
assert.match(repository, /category\.findMany/u);
const service = read('apps/api/src/services/video.service.ts');
assert.match(service, /VideoResponseSchema\.parse/u);
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const start = openapi.indexOf('  /api/v1/videos:');
const end = openapi.indexOf('  /api/v1/videos/{videoId}:', start);
assert.ok(start >= 0 && end > start, 'Missing video collection OpenAPI path');
const collection = openapi.slice(start, end);
assert.match(collection, / {4}post:[\s\S]*?x-streamlab-status: implemented/u);
assert.match(collection, / {4}get:[\s\S]*?x-streamlab-status: (?:planned|implemented)/u);
const rootPackage = JSON.parse(read('package.json'));
const apiPackage = JSON.parse(read('apps/api/package.json'));
for (const command of ['verify:video:create', 'test:video:create', 'smoke:video:create']) {
  assert.ok(rootPackage.scripts[command], `Missing root command: ${command}`);
}
for (const command of ['test:video:create', 'smoke:video:create']) {
  assert.ok(apiPackage.scripts[command], `Missing API command: ${command}`);
}
console.log(
  'PASS: STREAM-003.3 Express route -> auth -> validation -> transaction -> response -> OpenAPI',
);
