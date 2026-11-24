import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const root = JSON.parse(read('package.json'));
const api = JSON.parse(read('apps/api/package.json'));
for (const file of [
  'apps/api/src/repositories/upload-session.repository.ts',
  'apps/api/src/services/upload-session.service.ts',
  'apps/api/src/controllers/upload-session.controller.ts',
  'apps/api/tests/unit/upload-session.service.test.ts',
  'apps/api/tests/integration/upload-session.http.test.ts',
  'apps/api/scripts/upload-session-smoke.ts',
  'docs/development/stream-004-4-upload-session.md',
])
  assert.ok(existsSync(file), `Missing ${file}`);
assert.ok(root.scripts.check.includes('pnpm test:upload:session'));
assert.ok(root.scripts['smoke:upload:session']);
assert.ok(api.scripts['test:upload:session']);
const repository = read('apps/api/src/repositories/upload-session.repository.ts');
for (const marker of [
  'FOR UPDATE',
  'UPLOAD_ALREADY_ACTIVE',
  'expiresAt',
  'createStagingObjectKey',
  'ownerId',
]) {
  assert.ok(repository.includes(marker), `Repository guard missing: ${marker}`);
}
assert.ok(!repository.includes('getSignedUrl('));
const router = read('apps/api/src/routes/video.routes.ts');
assert.match(router, /router\.post\(\s*['"]\/:videoId\/uploads['"]\s*,/u);
assert.ok(router.includes('validateBody(CreateUploadRequestSchema)'));
const contracts = read('packages/contracts/src/api/upload.ts');
assert.ok(contracts.includes('CreateUploadSessionResponseSchema'));
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const start = openapi.indexOf('  /api/v1/videos/{videoId}/uploads:');
const end = openapi.indexOf('  /api/v1/uploads/{uploadId}/complete:', start);
assert.ok(start >= 0 && end > start);
const create = openapi.slice(start, end);
assert.ok(create.includes('x-streamlab-status: implemented'));
assert.ok(create.includes('SuccessUploadSessionCreated'));
const complete = openapi.slice(end, openapi.indexOf('\n  /api/v1/', end + 3));
assert.ok(complete.includes('x-streamlab-status: implemented'));
console.log(
  'PASS: STREAM-004.4 upload sessions, ownership, row lock, TTL, OpenAPI and test scripts',
);
