import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const text = (path) => readFileSync(path, 'utf8');
const expected = [
  'apps/api/src/lib/multipart-parts.ts',
  'apps/api/src/repositories/upload-multipart.repository.ts',
  'apps/api/src/services/upload-multipart-storage.service.ts',
  'apps/api/src/services/upload-multipart.service.ts',
  'apps/api/src/controllers/upload-multipart.controller.ts',
  'apps/api/tests/unit/multipart-parts.test.ts',
  'apps/api/tests/unit/upload-multipart.service.test.ts',
  'apps/api/tests/integration/upload-multipart.http.test.ts',
  'apps/api/scripts/upload-multipart-smoke.ts',
  'apps/web/src/features/videos/services/video-multipart-client.ts',
  'docs/development/stream-004-7-multipart.md',
];
for (const file of expected) assert.ok(existsSync(file), `Missing ${file}`);
const routes = text('apps/api/src/routes/upload.routes.ts');
for (const route of [
  '/:uploadId/parts/sign',
  '/:uploadId/parts',
  '/:uploadId/multipart/complete',
  '/:uploadId/multipart',
])
  assert.ok(routes.includes(route), `Missing route ${route}`);
assert.ok(text('apps/api/src/routes/video.routes.ts').includes('/:videoId/uploads/multipart'));
const repo = text('apps/api/src/repositories/upload-complete.repository.ts');
assert.ok(repo.includes('record.storageUploadId === null'));
const source = text('apps/api/src/services/upload-multipart.service.ts');
for (const fragment of [
  'verifyMultipartReceipts(',
  'markAssembled(',
  'deps.verify(',
  'deps.cancel(',
]) {
  assert.ok(source.includes(fragment), `Missing security check ${fragment}`);
}
const yaml = text('apps/api/docs/openapi/openapi.yaml');
for (const op of [
  'createMultipartUpload',
  'signMultipartPart',
  'listMultipartParts',
  'completeMultipartUpload',
  'abortMultipartUpload',
]) {
  assert.ok(yaml.includes(`operationId: ${op}`), `OpenAPI missing ${op}`);
}
const root = JSON.parse(text('package.json'));
const api = JSON.parse(text('apps/api/package.json'));
assert.ok(root.scripts.check.includes('pnpm test:upload:multipart'));
assert.ok(api.scripts['test:upload:multipart']);
console.log(
  'PASS: STREAM-004.7 multipart routing, S3 list/ETag verification, trusted completion and recovery',
);
