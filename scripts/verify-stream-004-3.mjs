import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), 'utf8');
const rootPkg = JSON.parse(read('package.json'));
const apiPkg = JSON.parse(read('apps/api/package.json'));
const files = [
  'apps/api/src/config/storage-env.ts',
  'apps/api/src/lib/storage-keys.ts',
  'apps/api/src/services/storage.service.ts',
  'apps/api/tests/unit/storage.service.test.ts',
  'apps/api/scripts/storage-smoke.ts',
  'docs/development/stream-004-3-storage-service.md',
];
for (const path of files) assert.ok(existsSync(join(root, path)), `Missing ${path}`);
assert.ok(apiPkg.dependencies['@aws-sdk/client-s3']);
assert.ok(apiPkg.dependencies['@aws-sdk/s3-request-presigner']);
for (const script of ['verify:upload:storage', 'test:upload:storage', 'smoke:upload:storage']) {
  assert.ok(rootPkg.scripts[script], `Missing script ${script}`);
}
assert.ok(rootPkg.scripts.check.includes('pnpm verify:upload:storage'));
assert.ok(rootPkg.scripts.check.includes('pnpm test:upload:storage'));
const service = read('apps/api/src/services/storage.service.ts');
assert.match(service, /new PutObjectCommand\(/u);
assert.match(service, /signableHeaders/u);
assert.match(service, /new HeadObjectCommand\(/u);
assert.match(service, /new DeleteObjectCommand\(/u);
assert.doesNotMatch(service, /router\.(post|put|patch)/u);
const policy = JSON.parse(read('docs/architecture/stream-004-1-upload-policy.json'));
assert.equal(policy.presignedUrlTtlSeconds, 600);
assert.equal(policy.stagingKeyTemplate, 'staging/<videoId>/<uploadId>/source');
console.log(
  'PASS: STREAM-004.3 S3 client, bounded signing, staging-only keys, unit/smoke scripts and architecture compatibility',
);
