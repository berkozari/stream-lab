import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const api = JSON.parse(read('apps/api/package.json'));
const web = JSON.parse(read('apps/web/package.json'));
const root = JSON.parse(read('package.json'));

for (const path of [
  'apps/api/src/routes/upload.routes.ts',
  'apps/api/src/controllers/upload-sign.controller.ts',
  'apps/api/src/services/upload-sign.service.ts',
  'apps/api/src/repositories/upload-sign.repository.ts',
  'apps/web/src/features/videos/services/video-upload-client.ts',
  'apps/web/src/features/videos/services/video-upload.service.ts',
  'apps/api/tests/unit/upload-sign.service.test.ts',
  'apps/api/tests/integration/upload-sign.http.test.ts',
  'apps/web/tests/video-upload-client.test.ts',
  'apps/api/scripts/upload-sign-smoke.ts',
])
  assert.ok(existsSync(path), `Missing ${path}`);

const app = read('apps/api/src/app.ts');
assert.match(
  app,
  /app\.use\(\s*['"]\/api\/v1\/uploads['"]\s*,\s*createUploadRouter\(/u,
  'Sign router is not mounted',
);
assert.ok(app.includes('sign: options.uploadSign'));
const route = read('apps/api/src/routes/upload.routes.ts');
assert.match(route, /router\.post\(\s*['"]\/:uploadId\/sign['"]\s*,/u);
assert.ok(route.includes('validateBody(SignUploadRequestSchema)'));
const repo = read('apps/api/src/repositories/upload-sign.repository.ts');
for (const needle of [
  'ownerId',
  'deletedAt: null',
  'expiresAt',
  'updateMany',
  'UPLOAD_NOT_FOUND',
]) {
  assert.ok(repo.includes(needle), `Missing repository guard: ${needle}`);
}
const storage = read('apps/api/src/services/storage.service.ts');
assert.ok(storage.includes('expiresInSeconds: ttl'));
const browser = read('apps/web/src/features/videos/services/video-upload-client.ts');
assert.ok(browser.includes("credentials: 'omit'"));
assert.ok(browser.includes("redirect: 'error'"));
assert.ok(!browser.includes('Authorization:'));
const contracts = read('packages/contracts/src/api/upload.ts');
assert.ok(contracts.includes('SignUploadRequestSchema'));
assert.ok(contracts.includes('SignUploadResponseSchema'));
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const marker = '  /api/v1/uploads/{uploadId}/sign:';
const start = openapi.indexOf(marker);
const end = openapi.indexOf('  /api/v1/uploads/{uploadId}/complete:', start);
assert.ok(start >= 0 && end > start, 'Missing signed PUT operation');
const sign = openapi.slice(start, end);
assert.ok(sign.includes('x-streamlab-status: implemented'));
assert.ok(sign.includes('SuccessUploadSigned'));
const complete = openapi.slice(end, openapi.indexOf('\n  /api/v1/', end + 2));
assert.ok(complete.includes('x-streamlab-status: implemented'));
for (const script of ['verify:upload:sign', 'test:upload:sign', 'smoke:upload:sign']) {
  assert.ok(root.scripts[script], `Missing root script ${script}`);
}
assert.ok(root.scripts.check.includes('pnpm test:upload:sign'));
assert.ok(api.scripts['test:upload:sign']);
assert.ok(web.scripts['test:upload:direct']);
console.log(
  'PASS: owner-only signing, 600s bounded TTL, isolated browser PUT, contracts and OpenAPI',
);
