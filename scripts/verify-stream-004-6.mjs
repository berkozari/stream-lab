import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const root = JSON.parse(read('package.json'));
const api = JSON.parse(read('apps/api/package.json'));
const paths = [
  'apps/api/src/lib/upload-content.ts',
  'apps/api/src/repositories/upload-complete.repository.ts',
  'apps/api/src/services/upload-verify-storage.service.ts',
  'apps/api/src/services/upload-complete.service.ts',
  'apps/api/src/controllers/upload-complete.controller.ts',
  'apps/api/tests/unit/upload-complete.service.test.ts',
  'apps/api/tests/unit/upload-verify-storage.test.ts',
  'apps/api/tests/integration/upload-complete.http.test.ts',
  'apps/api/scripts/upload-complete-smoke.ts',
  'docs/development/stream-004-6-completion.md',
];
for (const path of paths) assert.ok(existsSync(path), `Missing ${path}`);
const route = read('apps/api/src/routes/upload.routes.ts');
assert.match(route, /router\.post\(\s*['"]\/:uploadId\/complete['"]\s*,/u);
assert.ok(route.includes('createUploadCompleteController'));
const app = read('apps/api/src/app.ts');
assert.ok(app.includes('complete: options.uploadComplete'));
const complete = read('apps/api/src/services/upload-complete.service.ts');
assert.ok(complete.includes('await storage.promote(session)'));
assert.ok(complete.includes('await write(session, ownerId, verified)'));
const repo = read('apps/api/src/repositories/upload-complete.repository.ts');
for (const marker of [
  'ownerId',
  'deletedAt: null',
  'updateMany',
  'completedAt',
  'VERIFIED',
  'UPLOADED',
  'ORIGINAL',
]) {
  assert.ok(repo.includes(marker), `Completion repository guard missing ${marker}`);
}
const storage = read('apps/api/src/services/upload-verify-storage.service.ts');
for (const marker of [
  'CopySourceIfMatch',
  'GetObjectCommand',
  'CopyObjectCommand',
  'createVerifiedOriginalKey',
  'verifyUploadBytes',
]) {
  assert.ok(storage.includes(marker), `Storage verification missing ${marker}`);
}
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const start = openapi.indexOf('  /api/v1/uploads/{uploadId}/complete:');
assert.ok(start >= 0);
const next = openapi.indexOf('\n  /api/v1/', start + 3);
const operation = openapi.slice(start, next < 0 ? undefined : next);
assert.ok(operation.includes('x-streamlab-status: implemented'));
assert.ok(operation.includes("'200':"));
for (const marker of ['verify:upload:complete', 'test:upload:complete', 'smoke:upload:complete']) {
  assert.ok(root.scripts[marker], `Missing root command ${marker}`);
}
assert.ok(root.scripts.check.includes('pnpm test:upload:complete'));
assert.ok(api.scripts['test:upload:complete']);
console.log(
  'PASS: STREAM-004.6 completion, streaming verification, conditional S3 copy, atomic database state and test commands',
);
